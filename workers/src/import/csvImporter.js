/**
 * Universal CSV Onboarding & Mapping Pipeline
 * Maps arbitrary external CSV column structures into canonical commerce & financial events with non-blocking error isolation.
 */

export async function processCsvImport(db, { orgId, channelId, csvRows, columnMapping, importType = 'orders', sourceName = 'custom_import.csv' }) {
  const jobId = `imp_csv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const totalRows = csvRows.length;
  let successfulRows = 0;
  let skippedRows = 0;
  let failedRows = 0;
  const errorLogs = [];
  const startedAt = new Date().toISOString();

  // Create Job Record
  await db.prepare(`
    INSERT INTO import_jobs (id, org_id, channel_id, source_name, import_type, status, total_rows, started_at)
    VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)
  `).bind(jobId, orgId, channelId, sourceName, importType, totalRows, startedAt).run();

  for (let idx = 0; idx < csvRows.length; idx++) {
    const rawRow = csvRows[idx];
    try {
      const extOrderId = String(getMappedValue(rawRow, columnMapping, 'external_order_id') || '').trim();

      if (!extOrderId) {
        skippedRows++;
        errorLogs.push(`Row ${idx + 1}: Missing external_order_id mapping value`);
        continue;
      }

      const orderNumber     = String(getMappedValue(rawRow, columnMapping, 'order_number') || extOrderId).trim();
      const currency        = String(getMappedValue(rawRow, columnMapping, 'currency') || 'GBP').toUpperCase();
      const grossAmount    = parseAmount(getMappedValue(rawRow, columnMapping, 'gross_amount'));
      const discountAmount = parseAmount(getMappedValue(rawRow, columnMapping, 'discount_amount'));
      const shippingAmount = parseAmount(getMappedValue(rawRow, columnMapping, 'shipping_amount'));
      const taxAmount      = parseAmount(getMappedValue(rawRow, columnMapping, 'tax_amount'));
      const orderedAt      = getMappedValue(rawRow, columnMapping, 'ordered_at') || new Date().toISOString();

      const orderId = `ord_csv_${extOrderId}`;
      const netAmount = grossAmount - discountAmount + shippingAmount + taxAmount;

      // Upsert Order Header
      await db.prepare(`
        INSERT INTO canonical_orders (
          id, org_id, channel_id, import_job_id, external_order_id, order_number, currency,
          gross_amount, discount_amount, shipping_amount, tax_amount,
          financial_status, fulfillment_status, ordered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'fulfilled', ?)
        ON CONFLICT(org_id, channel_id, external_order_id) DO UPDATE SET
          import_job_id = excluded.import_job_id,
          gross_amount = excluded.gross_amount,
          discount_amount = excluded.discount_amount,
          shipping_amount = excluded.shipping_amount,
          tax_amount = excluded.tax_amount,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      `).bind(
        orderId, orgId, channelId, jobId, extOrderId, orderNumber, currency,
        grossAmount, discountAmount, shippingAmount, taxAmount, orderedAt
      ).run();

      // Upsert Line Item for Product Discovery & COGS
      const skuVal   = String(getMappedValue(rawRow, columnMapping, 'sku') || '').trim();
      const titleVal = String(getMappedValue(rawRow, columnMapping, 'product_title') || skuVal || 'CSV Product').trim();
      const qtyVal   = parseInt(getMappedValue(rawRow, columnMapping, 'quantity')) || 1;
      const unitPriceVal = parseAmount(getMappedValue(rawRow, columnMapping, 'unit_price')) || (grossAmount / (qtyVal || 1));

      if (skuVal) {
        const lineItemId = `itm_csv_${extOrderId}_${skuVal}`;
        await db.prepare(`
          INSERT INTO canonical_order_items (
            id, org_id, order_id, sku, title, qty, unit_price, unit_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.0)
          ON CONFLICT(org_id, order_id, sku) DO UPDATE SET
            qty = excluded.qty,
            unit_price = excluded.unit_price
        `).bind(lineItemId, orgId, orderId, skuVal, titleVal, qtyVal, unitPriceVal).run();
      }

      // Upsert Financial Sale Event
      const eventId = `evt_csv_sale_${extOrderId}`;
      await db.prepare(`
        INSERT INTO canonical_financial_events (
          id, org_id, channel_id, order_id, import_job_id, external_event_id, event_type, amount, currency, description, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'sale', ?, ?, 'CSV Imported Sale', ?)
        ON CONFLICT(org_id, channel_id, external_event_id, event_type) DO UPDATE SET amount = excluded.amount
      `).bind(eventId, orgId, channelId, orderId, jobId, `csv_sale_${extOrderId}`, netAmount, currency, orderedAt).run();

      // Optional Platform Fee Mapping
      const feeVal = parseAmount(getMappedValue(rawRow, columnMapping, 'platform_fee'));
      if (feeVal > 0) {
        const feeEvtId = `evt_csv_fee_${extOrderId}`;
        await db.prepare(`
          INSERT INTO canonical_financial_events (
            id, org_id, channel_id, order_id, import_job_id, external_event_id, event_type, amount, currency, description, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'platform_fee', ?, ?, 'CSV Imported Platform Fee', ?)
          ON CONFLICT(org_id, channel_id, external_event_id, event_type) DO UPDATE SET amount = excluded.amount
        `).bind(feeEvtId, orgId, channelId, orderId, jobId, `csv_fee_${extOrderId}`, -Math.abs(feeVal), currency, orderedAt).run();
      }

      successfulRows++;
    } catch (err) {
      failedRows++;
      errorLogs.push(`Row ${idx + 1}: ${err.message}`);
    }
  }

  const completedAt = new Date().toISOString();
  const finalStatus = (failedRows === 0 && skippedRows === 0) ? 'completed' : (successfulRows > 0 ? 'completed_with_errors' : 'failed');
  const errorSummary = errorLogs.length > 0 ? errorLogs.slice(0, 10).join('; ') : null;

  await db.prepare(`
    UPDATE import_jobs
    SET status = ?, processed_rows = ?, successful_rows = ?, skipped_rows = ?, failed_rows = ?, error_summary = ?, completed_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).bind(finalStatus, totalRows, successfulRows, skippedRows, failedRows, errorSummary, completedAt, jobId).run();

  return {
    jobId,
    status: finalStatus,
    totalRows,
    successfulRows,
    skippedRows,
    failedRows,
    errorSummary,
    startedAt,
    completedAt
  };
}

function getMappedValue(row, mapping, canonicalField) {
  const csvColumn = mapping[canonicalField];
  if (!csvColumn) return null;
  return row[csvColumn] !== undefined ? row[csvColumn] : null;
}

function parseAmount(val) {
  if (val === null || val === undefined || val === '') return 0.0;
  const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
  return isNaN(num) ? 0.0 : num;
}
