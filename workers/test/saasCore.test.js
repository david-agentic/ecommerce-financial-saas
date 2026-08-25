/**
 * Comprehensive Automated Integration & Regression Test Suite for SaaS Core Platform.
 */

import assert from 'assert';
import { test, describe } from 'node:test';
import { createMockSaaSDb } from './mockDb.js';
import { normalizeShopifyOrder } from '../src/normalization/shopifyAdapter.js';
import { normalizeTikTokOrder }  from '../src/normalization/tiktokAdapter.js';
import { normalizeWooCommerceOrder } from '../src/normalization/woocommerceAdapter.js';
import { processImportJob }      from '../src/import/importEngine.js';
import { processCsvImport }      from '../src/import/csvImporter.js';
import { getFinancialSummary,
         getChannelBreakdown,
         reconcilePayouts }      from '../src/reporting/financialEngine.js';

describe('Multi-Tenant E-Commerce Financial Intelligence SaaS Core Engine', () => {

  test('1. Multi-Tenant Isolation Rule: Data between Org A and Org B must remain completely isolated', async () => {
    const db = createMockSaaSDb();

    await db.prepare(`INSERT INTO organizations (id, name) VALUES ('org_a', 'Org Alpha Store')`).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES ('chn_a', 'org_a', 'shopify', 'Alpha Shopify')`).run();

    await db.prepare(`INSERT INTO organizations (id, name) VALUES ('org_b', 'Org Beta Store')`).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES ('chn_b', 'org_b', 'tiktok', 'Beta TikTok')`).run();

    await processImportJob(db, {
      orgId: 'org_a',
      channelId: 'chn_a',
      provider: 'shopify',
      rows: [{ id: '1001', name: '#1001', subtotal_price: 1000, processing_fee: 30 }]
    });

    await processImportJob(db, {
      orgId: 'org_b',
      channelId: 'chn_b',
      provider: 'tiktok',
      rows: [{ order_id: '2001', sku_subtotal: 500, platform_commission: 25 }]
    });

    const pnlA = await getFinancialSummary(db, 'org_a');
    assert.strictEqual(pnlA.metrics.grossSales, 1000);
    assert.strictEqual(pnlA.metrics.processingFees, 30);

    const pnlB = await getFinancialSummary(db, 'org_b');
    assert.strictEqual(pnlB.metrics.grossSales, 500);
    assert.strictEqual(pnlB.metrics.platformFees, 25);

    const orgBOrders = await db.prepare('SELECT * FROM canonical_orders WHERE org_id = ?').bind('org_b').all();
    assert.strictEqual(orgBOrders.results.length, 1);
    assert.strictEqual(orgBOrders.results[0].external_order_id, '2001');
  });

  test('2. Idempotency Check: Re-importing identical order updates header without duplicating rows or events', async () => {
    const db = createMockSaaSDb();
    const orgId = 'org_idempotent';
    const channelId = 'chn_idempotent';

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, 'Idempotent Org')`).bind(orgId).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES (?, ?, 'shopify', 'Shopify Store')`).bind(channelId, orgId).run();

    const orderRow = { id: 'ORD-DUP-1', name: '#1001', subtotal_price: 250, processing_fee: 7.50 };

    // Initial Import
    const res1 = await processImportJob(db, { orgId, channelId, provider: 'shopify', rows: [orderRow] });
    assert.strictEqual(res1.successfulRows, 1);

    // Duplicate Import
    const res2 = await processImportJob(db, { orgId, channelId, provider: 'shopify', rows: [orderRow] });
    assert.strictEqual(res2.successfulRows, 1);

    // Verify row count is still 1
    const orderRows = await db.prepare('SELECT * FROM canonical_orders WHERE org_id = ?').bind(orgId).all();
    assert.strictEqual(orderRows.results.length, 1);

    const eventRows = await db.prepare('SELECT * FROM canonical_financial_events WHERE org_id = ?').bind(orgId).all();
    assert.strictEqual(eventRows.results.length, 2); // 1 sale + 1 processing_fee
  });

  test('3. Shopify, TikTok, & WooCommerce Normalization Adapters', () => {
    // Shopify
    const normShopify = normalizeShopifyOrder({ id: '9901', name: '#9901', subtotal_price: '150.00', processing_fee: '4.50' }, 'org_t', 'chn_t');
    assert.strictEqual(normShopify.order.orderNumber, '#9901');
    assert.strictEqual(normShopify.events[1].eventType, 'processing_fee');

    // TikTok
    const normTikTok = normalizeTikTokOrder({ order_id: 'TTK-8801', sku_subtotal: 200.00, platform_commission: 16.00 }, 'org_t', 'chn_t');
    assert.strictEqual(normTikTok.order.externalOrderId, 'TTK-8801');
    assert.strictEqual(normTikTok.events[1].eventType, 'platform_fee');

    // WooCommerce
    const normWC = normalizeWooCommerceOrder({ id: '5501', number: 'WC-5501', total: '320.00', payment_gateway_fee: '9.60' }, 'org_t', 'chn_t');
    assert.strictEqual(normWC.order.externalOrderId, '5501');
    assert.strictEqual(normWC.events[1].eventType, 'processing_fee');
    assert.strictEqual(normWC.events[1].amount, -9.60);
  });

  test('4. CSV Onboarding & Custom Header Mapping Pipeline', async () => {
    const db = createMockSaaSDb();
    const orgId = 'org_csv_test';
    const channelId = 'chn_csv_test';

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, 'CSV Org')`).bind(orgId).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES (?, ?, 'manual_csv', 'CSV Channel')`).bind(channelId, orgId).run();

    const csvRows = [
      { 'Invoice ID': 'INV-101', 'Sale Total': '£450.00', 'Discount Given': '£20.00', 'Gateway Fee': '£13.50' },
      { 'Invoice ID': 'INV-102', 'Sale Total': '£600.00', 'Discount Given': '£0.00', 'Gateway Fee': '£18.00' }
    ];

    const columnMapping = {
      external_order_id: 'Invoice ID',
      order_number: 'Invoice ID',
      gross_amount: 'Sale Total',
      discount_amount: 'Discount Given',
      platform_fee: 'Gateway Fee'
    };

    const res = await processCsvImport(db, { orgId, channelId, csvRows, columnMapping, sourceName: 'sales_august.csv' });
    assert.strictEqual(res.successfulRows, 2);
    assert.strictEqual(res.status, 'completed');

    const pnl = await getFinancialSummary(db, orgId);
    assert.strictEqual(pnl.metrics.grossSales, 1050);
    assert.strictEqual(pnl.metrics.totalDiscounts, 20);
    assert.strictEqual(pnl.metrics.netSales, 1030);
    assert.strictEqual(pnl.metrics.platformFees, 31.50);
  });

  test('5. Universal Financial Engine: Calculates P&L, Net Proceeds, COGS, & Payout Reconciliation', async () => {
    const db = createMockSaaSDb();
    const orgId = 'org_fin_test';
    const channelId = 'chn_fin_test';

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, 'Fin Test Org')`).bind(orgId).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES (?, ?, 'shopify', 'Test Channel')`).bind(channelId, orgId).run();
    await db.prepare(`INSERT INTO canonical_products (id, org_id, sku, title, unit_cost) VALUES ('prd_1', ?, 'SKU-A', 'Product A', 20.0)`).bind(orgId).run();

    const rows = [];
    for (let i = 1; i <= 10; i++) {
      rows.push({
        id: `ORDER-${i}`,
        name: `#ORD-${i}`,
        subtotal_price: 100,
        total_discounts: 5,
        processing_fee: 3,
        line_items: [{ sku: 'SKU-A', title: 'Product A', quantity: 1, price: 100, unit_cost: 20 }]
      });
    }

    await processImportJob(db, { orgId, channelId, provider: 'shopify', rows });

    const pnl = await getFinancialSummary(db, orgId);
    assert.strictEqual(pnl.metrics.totalOrders, 10);
    assert.strictEqual(pnl.metrics.grossSales, 1000);
    assert.strictEqual(pnl.metrics.totalDiscounts, 50);
    assert.strictEqual(pnl.metrics.netSales, 950);
    assert.strictEqual(pnl.metrics.processingFees, 30);
    assert.strictEqual(pnl.metrics.netProceeds, 920);
    assert.strictEqual(pnl.metrics.totalCogs, 200);
    assert.strictEqual(pnl.metrics.grossProfit, 720);
  });

});
