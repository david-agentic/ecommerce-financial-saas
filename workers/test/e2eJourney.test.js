/**
 * End-to-End Customer Journey & First Value Verification Test Suite.
 */

import assert from 'assert';
import { test, describe } from 'node:test';
import { createMockSaaSDb } from './mockDb.js';
import workerRouter           from '../src/index.js';

describe('Phase H.5: End-to-End Customer Journey & First Value Verification', () => {

  test('Complete Merchant Journey: Signup -> Onboarding -> CSV Import -> COGS Setup -> P&L Real-Time Refresh', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    // Step 1: Sign Up New Merchant
    const signupReq = new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'e2e@merchant.com',
        name: 'Jane Merchant',
        password: 'SecurePassword789!',
        orgName: 'Jane Retail Global',
        currency: 'GBP'
      })
    });
    const signupRes = await workerRouter.fetch(signupReq, env, {});
    assert.strictEqual(signupRes.status, 200);
    const signupData = await signupRes.json();
    const token = signupData.token;
    const orgId = signupData.org.id;

    // Step 2: Complete Business Onboarding Setup
    const setupReq = new Request('https://fin-saas.app/api/v1/onboarding/setup', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Retail Global Ltd',
        currency: 'GBP',
        timezone: 'Europe/London',
        primaryObjective: 'finance_intelligence',
        region: 'UK'
      })
    });
    const setupRes = await workerRouter.fetch(setupReq, env, {});
    assert.strictEqual(setupRes.status, 200);

    // Step 3: Connect CSV Channel & Validate Headers Preview
    const chnRes = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/channels/connect', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'manual_csv', channelName: 'August CSV Sales' })
    }), env, {})).json();
    const channelId = chnRes.channelId;

    const csvRows = [
      { 'Invoice No': 'INV-9001', 'Total Amount': '200.00', 'Gateway Fee': '6.00', 'SKU Code': 'TSHIRT-BLK', 'Title': 'Black Cotton T-Shirt', 'Quantity': '2', 'Price': '100.00' }
    ];
    const columnMapping = {
      external_order_id: 'Invoice No',
      gross_amount: 'Total Amount',
      platform_fee: 'Gateway Fee',
      sku: 'SKU Code',
      product_title: 'Title',
      quantity: 'Quantity'
    };

    const valRes = await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/import/csv/validate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvRows, columnMapping })
    }), env, {});
    const valData = await valRes.json();
    assert.strictEqual(valData.isReadyToImport, true);

    // Step 4: Execute CSV Import
    const importRes = await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/import/csv', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, csvRows, columnMapping })
    }), env, {});
    const importData = await importRes.json();
    assert.strictEqual(importData.ok, true);
    assert.strictEqual(importData.result.successfulRows, 1);

    // Step 5: Verify Product Auto-Discovered with Missing COGS
    const cogsRes = await workerRouter.fetch(new Request(`https://fin-saas.app/api/v1/products/cogs?orgId=${orgId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId }
    }), env, {});
    const cogsData = await cogsRes.json();
    assert.strictEqual(cogsData.products.length, 1);
    assert.strictEqual(cogsData.products[0].sku, 'TSHIRT-BLK');
    assert.strictEqual(cogsData.isProfitCalculationIncomplete, true);

    // Step 6: Verify Attention Engine Surfaces Warning
    const attRes = await workerRouter.fetch(new Request(`https://fin-saas.app/api/v1/reports/attention?orgId=${orgId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId }
    }), env, {});
    const attData = await attRes.json();
    assert.strictEqual(attData.isEmptyState, false);
    assert.ok(attData.attentionItems.some(i => i.type === 'missing_cogs'));

    // Step 7: Merchant Updates Product Unit Cost (COGS)
    const updateRes = await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/products/cogs', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'TSHIRT-BLK', unitCost: 35.00 })
    }), env, {});
    assert.strictEqual((await updateRes.json()).ok, true);

    // Step 8: Verify Real-Time P&L Financial Report Recalculation (2 units * £35 = £70 COGS; Net Proceeds = £200 - £6 fee = £194; Gross Profit = £194 - £70 = £124)
    const pnlRes = await workerRouter.fetch(new Request(`https://fin-saas.app/api/v1/reports/financial?orgId=${orgId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Org-ID': orgId }
    }), env, {});
    const pnlData = await pnlRes.json();

    assert.strictEqual(pnlData.report.metrics.grossSales, 200);
    assert.strictEqual(pnlData.report.metrics.totalFees, 6);
    assert.strictEqual(pnlData.report.metrics.totalCogs, 70);
    assert.strictEqual(pnlData.report.metrics.grossProfit, 124);

    // Step 9: Verify Security Isolation (Attacker cannot view Jane's P&L)
    const attackerSignup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'attacker@test.com', password: 'Password123!', orgName: 'Attacker Org' })
    }), env, {})).json();

    const attackRes = await workerRouter.fetch(new Request(`https://fin-saas.app/api/v1/reports/financial?orgId=${orgId}`, {
      headers: { 'Authorization': `Bearer ${attackerSignup.token}`, 'X-Org-ID': orgId }
    }), env, {});
    assert.strictEqual(attackRes.status, 403, 'Cross-tenant request must be rejected with 403 Forbidden');
  });

});
