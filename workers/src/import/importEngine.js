/**
 * Universal Multi-Tenant Ingestion & Import Pipeline Engine
 * Handles non-blocking execution, idempotency, traceability, and batch metadata tracking.
 */

import { normalizeShopifyOrder } from '../normalization/shopifyAdapter.js';
import { normalizeTikTokOrder }  from '../normalization/tiktokAdapter.js';
import { normalizeWooCommerceOrder } from '../normalization/woocommerceAdapter.js';

export async function processImportJob(db, { orgId, channelId, provider, rows, importType = 'orders', sourceName = 'upload.json' }) {
  const jobId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const totalRows = rows.length;
  let successfulRows = 0;
  let skippedRows = 0;
  let failedRows = 0;
  const errorLogs = [];
  const startedAt = new Date().toISOString();

  // 1. Create Import Job Record
  await db.prepare(`
    INSERT INTO import_jobs (id, org_id, channel_id, source_name, import_type, status, total_rows, started_at)
    VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)
  `).bind(jobId, orgId, channelId, sourceName, importType, totalRows, startedAt).run();

  for (let idx = 0; idx < rows.length; idx++) {
    const rawRow = rows[idx];
    try {
      let normalized;
      if (provider === 'shopify') {
        normalized = normalizeShopifyOrder(rawRow, orgId, channelId);
      } else if (provider === 'tiktok') {
        normalized = normalizeTikTokOrder(rawRow, orgId, channelId);
      } else if (provider === 'woocommerce') {
        normalized = normalizeWooCommerceOrder(rawRow, orgId, channelId);
      } else {
        throw new Error(`Unsupported channel provider: ${provider}`);
      }

      const { order, items, events } = normalized;

      if (!order.externalOrderId) {
        skippedRows++;
        errorLogs.push(`Row ${idx + 1}: Missing external order ID`);
        continue;
      }

      // 2. Upsert Order Header (with import_job_id traceability)
      await db.prepare(`
        INSERT INTO canonical_orders (
          id, org_id, channel_id, import_job_id, external_order_id, order_number, currency,
          gross_amount, discount_amount, shipping_amount, tax_amount,
          financial_status, fulfillment_status, customer_email, ordered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(org_id, channel_id, external_order_id) DO UPDATE SET
          import_job_id = excluded.import_job_id,
          gross_amount = excluded.gross_amount,
          discount_amount = excluded.discount_amount,
          shipping_amount = excluded.shipping_amount,
          tax_amount = excluded.tax_amount,
          financial_status = excluded.financial_status,
          fulfillment_status = excluded.fulfillment_status,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      `).bind(
        order.id, order.orgId, order.channelId, jobId, order.externalOrderId, order.orderNumber, order.currency,
        order.grossAmount, order.discountAmount, order.shippingAmount, order.taxAmount,
        order.financialStatus, order.fulfillmentStatus, order.customerEmail, order.orderedAt
      ).run();

      // 3. Upsert Order Line Items
      for (const item of items) {
        await db.prepare(`
          INSERT INTO canonical_order_items (id, org_id, order_id, sku, title, qty, unit_price, unit_cost)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(org_id, order_id, sku) DO UPDATE SET
            qty = excluded.qty,
            unit_price = excluded.unit_price,
            unit_cost = excluded.unit_cost
        `).bind(item.id, item.orgId, item.orderId, item.sku, item.title, item.qty, item.unitPrice, item.unitCost).run();
      }

      // 4. Upsert Financial Ledger Events (with import_job_id traceability & idempotency)
      for (const evt of events) {
        await db.prepare(`
          INSERT INTO canonical_financial_events (
            id, org_id, channel_id, order_id, import_job_id, external_event_id, event_type, amount, currency, description, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(org_id, channel_id, external_event_id, event_type) DO UPDATE SET
            amount = excluded.amount,
            occurred_at = excluded.occurred_at
        `).bind(
          evt.id, evt.orgId, evt.channelId, evt.orderId, jobId, evt.externalEventId, evt.eventType,
          evt.amount, evt.currency, evt.description, evt.occurredAt
        ).run();
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
