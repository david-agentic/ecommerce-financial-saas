/**
 * SaaS Core Automated Integration & Regression Test Suite
 */

import assert from 'assert';
import { test, describe } from 'node:test';
import { createMockSaaSDb } from './mockDb.js';
import { normalizeShopifyOrder } from '../src/normalization/shopifyAdapter.js';
import { normalizeTikTokOrder }  from '../src/normalization/tiktokAdapter.js';
import { processImportJob }      from '../src/import/importEngine.js';
import { getFinancialSummary,
         getChannelBreakdown,
         reconcilePayouts }      from '../src/reporting/financialEngine.js';

describe('Multi-Tenant E-Commerce Financial Intelligence SaaS Core Engine', () => {

  test('1. Multi-Tenant Isolation Rule: Data between Org A and Org B must remain completely isolated', async () => {
    const db = createMockSaaSDb();

    // Org A
    await db.prepare(`INSERT INTO organizations (id, name) VALUES ('org_a', 'Org Alpha Store')`).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES ('chn_a', 'org_a', 'shopify', 'Alpha Shopify')`).run();

    // Org B
    await db.prepare(`INSERT INTO organizations (id, name) VALUES ('org_b', 'Org Beta Store')`).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES ('chn_b', 'org_b', 'tiktok', 'Beta TikTok')`).run();

    // Import $1,000 sale to Org A
    await processImportJob(db, {
      orgId: 'org_a',
      channelId: 'chn_a',
      provider: 'shopify',
      rows: [{ id: '1001', name: '#1001', subtotal_price: 1000, processing_fee: 30 }]
    });

    // Import $500 sale to Org B
    await processImportJob(db, {
      orgId: 'org_b',
      channelId: 'chn_b',
      provider: 'tiktok',
      rows: [{ order_id: '2001', sku_subtotal: 500, platform_commission: 25 }]
    });

    // Query Org A P&L
    const pnlA = await getFinancialSummary(db, 'org_a');
    assert.strictEqual(pnlA.metrics.grossSales, 1000);
    assert.strictEqual(pnlA.metrics.processingFees, 30);

    // Query Org B P&L
    const pnlB = await getFinancialSummary(db, 'org_b');
    assert.strictEqual(pnlB.metrics.grossSales, 500);
    assert.strictEqual(pnlB.metrics.platformFees, 25);

    // Verify Org B cannot see Org A orders
    const orgBOrders = await db.prepare('SELECT * FROM canonical_orders WHERE org_id = ?').bind('org_b').all();
    assert.strictEqual(orgBOrders.results.length, 1);
    assert.strictEqual(orgBOrders.results[0].external_order_id, '2001');
  });

  test('2. Shopify & TikTok Normalization: Raw payloads translate into canonical commerce & financial events', () => {
    const rawShopify = {
      id: '9901',
      name: '#9901',
      subtotal_price: '150.00',
      total_discounts: '10.00',
      processing_fee: '4.50',
      line_items: [{ sku: 'PEPTIDE-5MG', title: 'Peptide 5mg', quantity: 2, price: 75.00 }]
    };

    const normShopify = normalizeShopifyOrder(rawShopify, 'org_test', 'chn_test');
    assert.strictEqual(normShopify.order.orderNumber, '#9901');
    assert.strictEqual(normShopify.order.grossAmount, 150);
    assert.strictEqual(normShopify.order.discountAmount, 10);
    assert.strictEqual(normShopify.events.length, 2);
    assert.strictEqual(normShopify.events[0].eventType, 'sale');
    assert.strictEqual(normShopify.events[1].eventType, 'processing_fee');
    assert.strictEqual(normShopify.events[1].amount, -4.50);

    const rawTikTok = {
      order_id: 'TTK-8801',
      sku_subtotal: 200.00,
      platform_commission: 16.00
    };

    const normTikTok = normalizeTikTokOrder(rawTikTok, 'org_test', 'chn_test');
    assert.strictEqual(normTikTok.order.externalOrderId, 'TTK-8801');
    assert.strictEqual(normTikTok.events[1].eventType, 'platform_fee');
    assert.strictEqual(normTikTok.events[1].amount, -16.00);
  });

  test('3. Universal Financial Engine: Calculates P&L, fees, Net Proceeds, COGS, and Gross Margin %', async () => {
    const db = createMockSaaSDb();
    const orgId = 'org_fin_test';
    const channelId = 'chn_fin_test';

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, 'Fin Test Org')`).bind(orgId).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES (?, ?, 'shopify', 'Test Channel')`).bind(channelId, orgId).run();

    // Insert Product with COGS = $20
    await db.prepare(`INSERT INTO canonical_products (id, org_id, sku, title, unit_cost) VALUES ('prd_1', ?, 'SKU-A', 'Product A', 20.0)`).bind(orgId).run();

    // Process Import of 10 orders @ $100 gross = $1000 gross, $50 discount, $30 fee
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
    assert.strictEqual(pnl.metrics.netProceeds, 920); // 950 - 30
    assert.strictEqual(pnl.metrics.totalCogs, 200);   // 10 * $20
    assert.strictEqual(pnl.metrics.grossProfit, 720); // 920 - 200
  });

  test('4. Payout Reconciliation Engine: Matches expected vs recorded payouts and flags discrepancies', async () => {
    const db = createMockSaaSDb();
    const orgId = 'org_rec_test';
    const channelId = 'chn_rec_test';

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, 'Rec Test Org')`).bind(orgId).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES (?, ?, 'shopify', 'Rec Channel')`).bind(channelId, orgId).run();

    // Insert Payout Record expected = $950, recorded = $950 (Matched)
    await db.prepare(`
      INSERT INTO canonical_payouts (id, org_id, channel_id, external_payout_id, payout_date, net_amount, reconciliation_status)
      VALUES ('pay_1', ?, ?, 'PAY-001', '2026-08-25', 950.0, 'unreconciled')
    `).bind(orgId, channelId).run();

    // Linked Financial Sale Event ($1000) and Fee Event (-$50)
    await db.prepare(`
      INSERT INTO canonical_financial_events (id, org_id, channel_id, payout_id, external_event_id, event_type, amount, occurred_at)
      VALUES ('evt_1', ?, ?, 'pay_1', 'tx_1', 'sale', 1000.0, '2026-08-25')
    `).bind(orgId, channelId).run();

    await db.prepare(`
      INSERT INTO canonical_financial_events (id, org_id, channel_id, payout_id, external_event_id, event_type, amount, occurred_at)
      VALUES ('evt_2', ?, ?, 'pay_1', 'tx_2', 'processing_fee', -50.0, '2026-08-25')
    `).bind(orgId, channelId).run();

    const reconciliations = await reconcilePayouts(db, orgId);
    assert.strictEqual(reconciliations.length, 1);
    assert.strictEqual(reconciliations[0].recordedNetPayout, 950);
    assert.strictEqual(reconciliations[0].expectedNetPayout, 950);
    assert.strictEqual(reconciliations[0].discrepancy, 0);
    assert.strictEqual(reconciliations[0].status, 'matched');
  });

});
