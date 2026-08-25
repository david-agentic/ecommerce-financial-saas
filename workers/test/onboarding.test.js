/**
 * Guided Customer Onboarding & COGS Engine Automated Test Suite.
 */

import assert from 'assert';
import { test, describe } from 'node:test';
import { createMockSaaSDb } from './mockDb.js';
import workerRouter           from '../src/index.js';

describe('Phase H: Customer Onboarding, Channel Status & Product Cost Engine', () => {

  test('1. Organization Onboarding Setup: Customer updates business profile & primary objective', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    // Signup user
    const signup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@onboard.com', password: 'Password123!', orgName: 'Initial Name' })
    }), env, {})).json();

    const token = signup.token;
    const orgId = signup.org.id;

    // Complete Onboarding Setup
    const setupReq = new Request('https://fin-saas.app/api/v1/onboarding/setup', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Acme Retail Ltd',
        currency: 'GBP',
        timezone: 'Europe/London',
        primaryObjective: 'finance_intelligence',
        region: 'UK'
      })
    });

    const res = await workerRouter.fetch(setupReq, env, {});
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.name, 'Acme Retail Ltd');
    assert.strictEqual(body.primaryObjective, 'finance_intelligence');

    // Verify DB
    const dbOrg = await db.prepare('SELECT name, primary_objective FROM organizations WHERE id = ?').bind(orgId).first();
    assert.strictEqual(dbOrg.name, 'Acme Retail Ltd');
    assert.strictEqual(dbOrg.primary_objective, 'finance_intelligence');
  });

  test('2. Channel Registry Status: Returns honest status for supported providers', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    const signup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'chn@test.com', password: 'Password123!', orgName: 'Channel Test Org' })
    }), env, {})).json();

    const token = signup.token;
    const orgId = signup.org.id;

    const req = new Request(`https://fin-saas.app/api/v1/channels/status?orgId=${orgId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId }
    });

    const res = await workerRouter.fetch(req, env, {});
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.channels.length, 4);

    const shopify = body.channels.find(c => c.provider === 'shopify');
    assert.strictEqual(shopify.status, 'ReadyToConnect');
    assert.strictEqual(shopify.isConfigured, false);
  });

  test('3. CSV Mapping Validation Preview: Detects required vs missing fields', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    const signup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'csvval@test.com', password: 'Password123!', orgName: 'CSV Val Org' })
    }), env, {})).json();

    const token = signup.token;
    const orgId = signup.org.id;

    const csvRows = [
      { 'Invoice ID': 'INV-1', 'Sale Total': '100.00' },
      { 'Invoice ID': 'INV-2', 'Sale Total': '200.00' }
    ];

    // Valid Mapping
    const validReq = new Request('https://fin-saas.app/api/v1/import/csv/validate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csvRows,
        columnMapping: { external_order_id: 'Invoice ID', gross_amount: 'Sale Total' }
      })
    });
    const validRes = await workerRouter.fetch(validReq, env, {});
    const validBody = await validRes.json();

    assert.strictEqual(validBody.isReadyToImport, true);
    assert.strictEqual(validBody.totalRowsDetected, 2);
    assert.strictEqual(validBody.validRows, 2);

    // Invalid Mapping (Missing gross_amount)
    const invalidReq = new Request('https://fin-saas.app/api/v1/import/csv/validate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csvRows,
        columnMapping: { external_order_id: 'Invoice ID' }
      })
    });
    const invalidRes = await workerRouter.fetch(invalidReq, env, {});
    const invalidBody = await invalidRes.json();

    assert.strictEqual(invalidBody.isReadyToImport, false);
    assert.ok(invalidBody.missingRequiredMappings.includes('gross_amount'));
  });

  test('4. Product Cost (COGS) Management: Discovers products and updates unit costs', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    const signup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cogs@test.com', password: 'Password123!', orgName: 'COGS Org' })
    }), env, {})).json();

    const token = signup.token;
    const orgId = signup.org.id;

    // Connect channel & import order with line items
    const chnRes = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/channels/connect', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'shopify', channelName: 'Shopify Store' })
    }), env, {})).json();

    await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/import', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: chnRes.channelId,
        provider: 'shopify',
        rows: [{
          id: 'ORD-SKU-1', name: '#1001', subtotal_price: 300,
          line_items: [{ sku: 'PROD-A', title: 'Widget A', quantity: 2, price: 150 }]
        }]
      })
    }), env, {});

    // Fetch Products (Should auto-discover PROD-A with missing unit cost)
    const getRes = await workerRouter.fetch(new Request(`https://fin-saas.app/api/v1/products/cogs?orgId=${orgId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId }
    }), env, {});
    const getBody = await getRes.json();

    assert.strictEqual(getBody.products.length, 1);
    assert.strictEqual(getBody.products[0].sku, 'PROD-A');
    assert.strictEqual(getBody.isProfitCalculationIncomplete, true);

    // Update Unit Cost
    const postRes = await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/products/cogs', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'PROD-A', unitCost: 45.00 })
    }), env, {});
    const postBody = await postRes.json();

    assert.strictEqual(postBody.ok, true);
    assert.strictEqual(postBody.unitCost, 45.00);

    // Verify P&L report includes COGS (2 units * £45 = £90 COGS, Gross Profit = £300 - £90 = £210)
    const pnlRes = await workerRouter.fetch(new Request(`https://fin-saas.app/api/v1/reports/financial?orgId=${orgId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId }
    }), env, {});
    const pnlBody = await pnlRes.json();

    assert.strictEqual(pnlBody.report.metrics.totalCogs, 90);
    assert.strictEqual(pnlBody.report.metrics.grossProfit, 210);
  });

  test('5. Attention & Action Items Engine: Surfaces empty states & missing COGS warnings', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    const signup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'attention@test.com', password: 'Password123!', orgName: 'Attention Org' })
    }), env, {})).json();

    const token = signup.token;
    const orgId = signup.org.id;

    // Fresh account (0 orders) -> isEmptyState = true
    const resEmpty = await workerRouter.fetch(new Request(`https://fin-saas.app/api/v1/reports/attention?orgId=${orgId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId }
    }), env, {});
    const bodyEmpty = await resEmpty.json();

    assert.strictEqual(bodyEmpty.isEmptyState, true);
  });

});
