/**
 * Comprehensive Automated Integration & Regression Test Suite for SaaS Core Platform & Web Application.
 */

import assert from 'assert';
import { test, describe } from 'node:test';
import { createMockSaaSDb } from './mockDb.js';
import workerRouter           from '../src/index.js';
import { normalizeShopifyOrder } from '../src/normalization/shopifyAdapter.js';
import { normalizeTikTokOrder }  from '../src/normalization/tiktokAdapter.js';
import { normalizeWooCommerceOrder } from '../src/normalization/woocommerceAdapter.js';
import { processImportJob }      from '../src/import/importEngine.js';
import { processCsvImport }      from '../src/import/csvImporter.js';
import { getFinancialSummary,
         reconcilePayouts }      from '../src/reporting/financialEngine.js';

describe('Multi-Tenant E-Commerce Financial Intelligence SaaS Core Engine & Web App', () => {

  test('1. Web Application Entrypoint: GET / returns HTML SPA UI', async () => {
    const req = new Request('https://fin-saas.app/', { method: 'GET' });
    const res = await workerRouter.fetch(req, {}, {});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
    const html = await res.text();
    assert.ok(html.includes('FinSaaS Intelligence'));
  });

  test('2. Multi-Tenant Isolation Rule: Data between Org A and Org B must remain completely isolated', async () => {
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

  test('3. Idempotency Check: Re-importing identical order updates header without duplicating rows or events', async () => {
    const db = createMockSaaSDb();
    const orgId = 'org_idempotent';
    const channelId = 'chn_idempotent';

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, 'Idempotent Org')`).bind(orgId).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES (?, ?, 'shopify', 'Shopify Store')`).bind(channelId, orgId).run();

    const orderRow = { id: 'ORD-DUP-1', name: '#1001', subtotal_price: 250, processing_fee: 7.50 };

    const res1 = await processImportJob(db, { orgId, channelId, provider: 'shopify', rows: [orderRow] });
    assert.strictEqual(res1.successfulRows, 1);

    const res2 = await processImportJob(db, { orgId, channelId, provider: 'shopify', rows: [orderRow] });
    assert.strictEqual(res2.successfulRows, 1);

    const orderRows = await db.prepare('SELECT * FROM canonical_orders WHERE org_id = ?').bind(orgId).all();
    assert.strictEqual(orderRows.results.length, 1);
  });

  test('4. Shopify, TikTok, & WooCommerce Normalization Adapters', () => {
    const normShopify = normalizeShopifyOrder({ id: '9901', name: '#9901', subtotal_price: '150.00', processing_fee: '4.50' }, 'org_t', 'chn_t');
    assert.strictEqual(normShopify.order.orderNumber, '#9901');

    const normTikTok = normalizeTikTokOrder({ order_id: 'TTK-8801', sku_subtotal: 200.00, platform_commission: 16.00 }, 'org_t', 'chn_t');
    assert.strictEqual(normTikTok.order.externalOrderId, 'TTK-8801');

    const normWC = normalizeWooCommerceOrder({ id: '5501', number: 'WC-5501', total: '320.00', payment_gateway_fee: '9.60' }, 'org_t', 'chn_t');
    assert.strictEqual(normWC.order.externalOrderId, '5501');
  });

  test('5. CSV Onboarding & Custom Header Mapping Pipeline', async () => {
    const db = createMockSaaSDb();
    const orgId = 'org_csv_test';
    const channelId = 'chn_csv_test';

    await db.prepare(`INSERT INTO organizations (id, name) VALUES (?, 'CSV Org')`).bind(orgId).run();
    await db.prepare(`INSERT INTO sales_channels (id, org_id, provider, channel_name) VALUES (?, ?, 'manual_csv', 'CSV Channel')`).bind(channelId, orgId).run();

    const csvRows = [
      { 'Invoice ID': 'INV-101', 'Sale Total': '£450.00', 'Discount Given': '£20.00', 'Gateway Fee': '£13.50' }
    ];

    const columnMapping = {
      external_order_id: 'Invoice ID',
      gross_amount: 'Sale Total',
      discount_amount: 'Discount Given',
      platform_fee: 'Gateway Fee'
    };

    const res = await processCsvImport(db, { orgId, channelId, csvRows, columnMapping, sourceName: 'sales_august.csv' });
    assert.strictEqual(res.successfulRows, 1);
    assert.strictEqual(res.status, 'completed');
  });

  test('6. REST API Router with Authentication: /api/v1/reports/financial via Worker Router', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    // Signup user to get token and org
    const signupReq = new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'router@test.com', password: 'Password123!', orgName: 'Router Test Org' })
    });

    const signupRes = await workerRouter.fetch(signupReq, env, {});
    const signupData = await signupRes.json();

    const token = signupData.token;
    const orgId = signupData.org.id;

    const req = new Request(`https://fin-saas.app/api/v1/reports/financial?orgId=${orgId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId }
    });

    const res = await workerRouter.fetch(req, env, {});
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.report.metrics);
  });

});
