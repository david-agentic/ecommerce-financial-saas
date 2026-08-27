/**
 * Guided Onboarding, Channel Status Registry, CSV Validation & COGS Management Routes
 */

import { authorizeOrgMembership } from '../auth/middleware.js';
import {
  getFinancialSummary,
  computeDataConfidence,
  getPeriodMovement,
  getAttentionCenterItems,
  getProfitWaterfall
} from '../reporting/financialEngine.js';

export async function handleOnboardingRoutes(request, env, path, user) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-ID'
  };

  const url = new URL(request.url);
  const targetOrgId = request.headers.get('X-Org-ID') || url.searchParams.get('orgId');

  // 1. Organization Onboarding Setup
  if (path === '/api/v1/onboarding/setup' && request.method === 'POST') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'admin');
    const body = await request.json();

    const name             = String(body.name || membership.org_name).trim();
    const currency         = String(body.currency || membership.base_currency).toUpperCase();
    const timezone         = String(body.timezone || 'Europe/London').trim();
    const country          = String(body.country || body.region || 'PK').trim();
    const businessType     = String(body.businessType || body.primaryObjective || 'ecommerce').trim();

    await env.DB.prepare(`
      UPDATE organizations
      SET name = ?, base_currency = ?, timezone = ?, primary_objective = ?, region = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).bind(name, currency, timezone, businessType, country, membership.org_id).run();

    return json({ ok: true, orgId: membership.org_id, name, currency, timezone, country, businessType, primaryObjective: businessType, region: country }, corsHeaders);
  }

  // 2. Channel Connections & Honest Status Registry
  if (path === '/api/v1/channels/status' && request.method === 'GET') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'viewer');

    const result = await env.DB.prepare(`
      SELECT id, provider, channel_name, external_store_id, status, last_sync_at, last_error, created_at
      FROM sales_channels
      WHERE org_id = ?
    `).bind(membership.org_id).all();

    const existingChannels = result.results || [];
    const supportedProviders = [
      { provider: 'shopify', title: 'Shopify', desc: 'Automated order & fee normalizer', supportedModes: ['historical_import', 'live_connection_ready'] },
      { provider: 'tiktok', title: 'TikTok Shop', desc: 'Settlements & commission normalizer', supportedModes: ['historical_import', 'live_connection_ready'] },
      { provider: 'woocommerce', title: 'WooCommerce', desc: 'Custom portal & gateway fee parser', supportedModes: ['historical_import', 'live_connection_ready'] },
      { provider: 'manual_csv', title: 'Custom CSV Import', desc: 'Universal column header mapper', supportedModes: ['historical_import'] }
    ];

    const channelRegistry = supportedProviders.map(p => {
      const active = existingChannels.find(c => c.provider === p.provider);
      return {
        provider: p.provider,
        title: p.title,
        description: p.desc,
        status: active ? active.status : 'ReadyToConnect',
        isConfigured: !!active,
        channelId: active ? active.id : null,
        externalStoreId: active ? active.external_store_id : null,
        lastSyncAt: active ? active.last_sync_at : null,
        supportedModes: p.supportedModes
      };
    });

    return json({ ok: true, orgId: membership.org_id, channels: channelRegistry }, corsHeaders);
  }

  // 3. CSV Validation & Mapping Preview Endpoint
  if (path === '/api/v1/import/csv/validate' && request.method === 'POST') {
    await authorizeOrgMembership(env, user.id, targetOrgId, 'viewer');
    const body = await request.json();
    const csvRows       = body.csvRows || [];
    const columnMapping = body.columnMapping || {};

    const requiredFields = ['external_order_id', 'gross_amount'];
    const optionalFields = ['discount_amount', 'shipping_amount', 'tax_amount', 'platform_fee', 'processing_fee', 'refund_amount', 'sku', 'product_title'];

    const mappedHeaders = Object.keys(columnMapping);
    const missingRequired = requiredFields.filter(f => !columnMapping[f]);

    let validRows = 0;
    let warningRows = 0;

    csvRows.forEach(row => {
      const orderIdKey = columnMapping['external_order_id'];
      const grossKey   = columnMapping['gross_amount'];
      if (orderIdKey && grossKey && row[orderIdKey] && row[grossKey] !== undefined) {
        validRows++;
      } else {
        warningRows++;
      }
    });

    return json({
      ok: true,
      totalRowsDetected: csvRows.length,
      validRows,
      warningRows,
      missingRequiredMappings: missingRequired,
      mappedFields: mappedHeaders,
      isReadyToImport: missingRequired.length === 0 && validRows > 0
    }, corsHeaders);
  }

  // 4. COGS Product Catalog & Unit Cost Management
  if (path === '/api/v1/products/cogs' && request.method === 'GET') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'viewer');

    // Auto-discover products from order items if missing in canonical_products
    await env.DB.prepare(`
      INSERT OR IGNORE INTO canonical_products (id, org_id, sku, title, unit_cost)
      SELECT 'prd_' || hex(randomblob(4)), org_id, sku, title, 0.0
      FROM canonical_order_items
      WHERE org_id = ?
      GROUP BY sku
    `).bind(membership.org_id).run();

    const result = await env.DB.prepare(`
      SELECT id, sku, title, category, unit_cost, updated_at
      FROM canonical_products
      WHERE org_id = ?
      ORDER BY title ASC
    `).bind(membership.org_id).all();

    const products = result.results || [];
    const uncostedCount = products.filter(p => p.unit_cost === 0).length;

    return json({
      ok: true,
      orgId: membership.org_id,
      products,
      totalProducts: products.length,
      uncostedProductsCount: uncostedCount,
      isProfitCalculationIncomplete: uncostedCount > 0
    }, corsHeaders);
  }

  if (path === '/api/v1/products/cogs' && request.method === 'POST') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'member');
    const body = await request.json();
    const sku = String(body.sku || '').trim();
    const unitCost = parseFloat(body.unitCost || 0);

    if (!sku) return jsonError(400, 'Product SKU required', corsHeaders);

    await env.DB.prepare(`
      UPDATE canonical_products
      SET unit_cost = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE org_id = ? AND sku = ?
    `).bind(unitCost, membership.org_id, sku).run();

    // Update line items unit cost for margin recalculation
    await env.DB.prepare(`
      UPDATE canonical_order_items
      SET unit_cost = ?
      WHERE org_id = ? AND sku = ?
    `).bind(unitCost, membership.org_id, sku).run();

    return json({ ok: true, sku, unitCost }, corsHeaders);
  }

  // 5. Dashboard Action & Attention Engine
  if (path === '/api/v1/reports/attention' && request.method === 'GET') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'viewer');

    const attentionItems = [];

    // Check 1: Missing COGS
    const uncostedRes = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM canonical_products WHERE org_id = ? AND unit_cost = 0.0
    `).bind(membership.org_id).first();
    const uncostedCount = uncostedRes?.count || 0;
    if (uncostedCount > 0) {
      attentionItems.push({
        type: 'missing_cogs',
        severity: 'warning',
        title: `${uncostedCount} Products Missing Unit Costs`,
        message: 'Gross profit calculations are incomplete. Set product unit costs to accurately track operating margins.',
        actionView: 'cogs'
      });
    }

    // Check 2: Unreconciled Payout Discrepancies
    const discRes = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM canonical_payouts WHERE org_id = ? AND reconciliation_status = 'discrepancy'
    `).bind(membership.org_id).first();
    const discCount = discRes?.count || 0;
    if (discCount > 0) {
      attentionItems.push({
        type: 'payout_discrepancy',
        severity: 'danger',
        title: `${discCount} Payout Settlement Discrepancies Detected`,
        message: 'Discrepancies found between channel reported payout totals and expected net sales.',
        actionView: 'payouts'
      });
    }

    // Check 3: Empty State (No orders imported)
    const orderCountRes = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM canonical_orders WHERE org_id = ?
    `).bind(membership.org_id).first();
    const orderCount = orderCountRes?.count || 0;

    return json({
      ok: true,
      orgId: membership.org_id,
      isEmptyState: orderCount === 0,
      attentionItems
    }, corsHeaders);
  }

  // Expense Management: List Expenses
  if (path === '/api/v1/expenses' && request.method === 'GET') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'viewer');
    try {
      const result = await env.DB.prepare(`
        SELECT id, date, category, vendor, description, amount, currency, payment_status, reference, created_at
        FROM business_expenses
        WHERE org_id = ?
        ORDER BY date DESC
        LIMIT 200
      `).bind(membership.org_id).all();
      return json({ ok: true, expenses: result.results || [] }, corsHeaders);
    } catch (e) {
      return json({ ok: true, expenses: [] }, corsHeaders);
    }
  }

  // Expense Management: Create Expense
  if (path === '/api/v1/expenses' && request.method === 'POST') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'member');
    const body = await request.json();
    const id = 'exp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const date = String(body.date || new Date().toISOString().split('T')[0]);
    const category = String(body.category || 'other');
    const vendor = String(body.vendor || '').trim();
    const description = String(body.description || '').trim();
    const amount = parseFloat(body.amount || 0);
    const currency = String(body.currency || 'PKR').toUpperCase();
    const paymentStatus = String(body.paymentStatus || 'paid');
    const reference = String(body.reference || '').trim();

    if (amount <= 0) return jsonError(400, 'Expense amount must be greater than zero', corsHeaders);

    try {
      await env.DB.prepare(`
        INSERT INTO business_expenses (id, org_id, date, category, vendor, description, amount, currency, payment_status, reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, membership.org_id, date, category, vendor, description, amount, currency, paymentStatus, reference).run();
      return json({ ok: true, expenseId: id }, corsHeaders);
    } catch (e) {
      return jsonError(500, 'Failed to create expense: ' + e.message, corsHeaders);
    }
  }

  // Expense Management: Delete Expense
  if (path.startsWith('/api/v1/expenses/') && request.method === 'DELETE') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'admin');
    const expenseId = path.split('/api/v1/expenses/')[1];
    if (!expenseId) return jsonError(400, 'Missing expense ID', corsHeaders);

    await env.DB.prepare(`
      DELETE FROM business_expenses WHERE id = ? AND org_id = ?
    `).bind(expenseId, membership.org_id).run();
    return json({ ok: true, deleted: expenseId }, corsHeaders);
  }

  // Financial Intelligence Command Center Payload
  if (path === '/api/v1/intelligence/command-center' && request.method === 'GET') {
    const membership = await authorizeOrgMembership(env, user.id, targetOrgId, 'viewer');
    const orgId = membership.org_id;

    const [summary, confidence, movement, attention, waterfall] = await Promise.all([
      getFinancialSummary(env.DB, orgId),
      computeDataConfidence(env.DB, orgId),
      getPeriodMovement(env.DB, orgId),
      getAttentionCenterItems(env.DB, orgId),
      getProfitWaterfall(env.DB, orgId)
    ]);

    return json({
      ok: true,
      orgId,
      summary,
      confidence,
      movement,
      attention,
      waterfall
    }, corsHeaders);
  }

  return null;
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function jsonError(status, message, headers) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
