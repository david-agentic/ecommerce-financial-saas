/**
 * Universal Multi-Tenant Import Engine
 * Ingests, normalizes, and stores channel records with non-blocking error handling and tenant isolation.
 */

import { normalizeShopifyOrder } from '../normalization/shopifyAdapter.js';
import { normalizeTikTokOrder }  from '../normalization/tiktokAdapter.js';

export async function processImportJob(db, { orgId, channelId, provider, rows, importType = 'orders', sourceName = 'upload.json' }) {
  const jobId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const totalRows = rows.length;
  let successfulRows = 0;
  let skippedRows = 0;
  const errorLogs = [];

  // 1. Create Import Job Record
  await db.prepare(`
    INSERT INTO import_jobs (id, org_id, channel_id, source_name, import_type, status, total_rows)
    VALUES (?, ?, ?, ?, ?, 'processing', ?)
  `).bind(jobId, orgId, channelId, sourceName, importType, totalRows).run();

  for (let idx = 0; idx < rows.length; idx++) {
    const rawRow = rows[idx];
    try {
      let normalized;
      if (provider === 'shopify') {
        normalized = normalizeShopifyOrder(rawRow, orgId, channelId);
      } else if (provider === 'tiktok') {
        normalized = normalizeTikTokOrder(rawRow, orgId, channelId);
      } else {
        throw new Error(`Unsupported channel provider: ${provider}`);
      }

      const { order, items, events } = normalized;

      if (!order.externalOrderId) {
        skippedRows++;
        errorLogs.push(`Row ${idx + 1}: Missing external order ID`);
        continue;
      }

      // Upsert Order
      await db.prepare(`
        INSERT INTO canonical_orders (
          id, org_id, channel_id, external_order_id, order_number, currency,
          gross_amount, discount_amount, shipping_amount, tax_amount,
          financial_status, fulfillment_status, customer_email, ordered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(org_id, channel_id, external_order_id) DO UPDATE SET
          gross_amount = excluded.gross_amount,
          discount_amount = excluded.discount_amount,
          shipping_amount = excluded.shipping_amount,
          tax_amount = excluded.tax_amount,
          financial_status = excluded.financial_status,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      `).bind(
        order.id, order.orgId, order.channelId, order.externalOrderId, order.orderNumber, order.currency,
        order.grossAmount, order.discountAmount, order.shippingAmount, order.taxAmount,
        order.financialStatus, order.fulfillmentStatus, order.customerEmail, order.orderedAt
      ).run();

      // Upsert Items
      for (const item of items) {
        await db.prepare(`
          INSERT INTO canonical_order_items (id, org_id, order_id, sku, title, qty, unit_price, unit_cost)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET qty = excluded.qty, unit_price = excluded.unit_price
        `).bind(item.id, item.orgId, item.orderId, item.sku, item.title, item.qty, item.unitPrice, item.unitCost).run();
      }

      // Upsert Financial Events
      for (const evt of events) {
        await db.prepare(`
          INSERT INTO canonical_financial_events (
            id, org_id, channel_id, order_id, external_event_id, event_type, amount, currency, description, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET amount = excluded.amount
        `).bind(
          evt.id, evt.orgId, evt.channelId, evt.orderId, evt.externalEventId, evt.eventType,
          evt.amount, evt.currency, evt.description, evt.occurredAt
        ).run();
      }

      successfulRows++;
    } catch (err) {
      skippedRows++;
      errorLogs.push(`Row ${idx + 1}: ${err.message}`);
    }
  }

  const finalStatus = skippedRows === 0 ? 'completed' : (successfulRows > 0 ? 'completed_with_errors' : 'failed');
  const errorSummary = errorLogs.length > 0 ? errorLogs.slice(0, 10).join('; ') : null;

  await db.prepare(`
    UPDATE import_jobs
    SET status = ?, processed_rows = ?, successful_rows = ?, skipped_rows = ?, error_summary = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).bind(finalStatus, totalRows, successfulRows, skippedRows, errorSummary, jobId).run();

  return {
    jobId,
    status: finalStatus,
    totalRows,
    successfulRows,
    skippedRows,
    errorSummary
  };
}
