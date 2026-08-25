/**
 * Multi-Tenant E-Commerce Financial Intelligence SaaS API Router
 */

import { processImportJob }      from './import/importEngine.js';
import { processCsvImport }      from './import/csvImporter.js';
import { getFinancialSummary,
         getChannelBreakdown,
         reconcilePayouts }      from './reporting/financialEngine.js';

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-ID'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Health Check
      if (path === '/' || path === '/health') {
        return json({ ok: true, service: 'fin-saas-api', version: '1.0.0', ts: new Date().toISOString() }, corsHeaders);
      }

      // 2. Organization Provisioning
      if (path === '/api/v1/orgs/create' && request.method === 'POST') {
        const body = await request.json();
        const orgId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const name  = body.name || 'My E-Commerce Business';
        const curr  = body.currency || 'GBP';

        await env.DB.prepare(`
          INSERT INTO organizations (id, name, base_currency) VALUES (?, ?, ?)
        `).bind(orgId, name, curr).run();

        return json({ ok: true, orgId, name, currency: curr }, corsHeaders);
      }

      // Extract Tenant ID from Header or query parameter
      const orgId = request.headers.get('X-Org-ID') || url.searchParams.get('orgId');

      // 3. Connect Sales Channel
      if (path === '/api/v1/channels/connect' && request.method === 'POST') {
        if (!orgId) return jsonError(400, 'Missing X-Org-ID header', corsHeaders);
        const body = await request.json();
        const channelId = `chn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        await env.DB.prepare(`
          INSERT INTO sales_channels (id, org_id, provider, channel_name, external_store_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(channelId, orgId, body.provider, body.channelName, body.externalStoreId || null).run();

        return json({ ok: true, channelId, provider: body.provider, name: body.channelName }, corsHeaders);
      }

      // 4. Data Import & Normalization Endpoint (JSON)
      if (path === '/api/v1/import' && request.method === 'POST') {
        if (!orgId) return jsonError(400, 'Missing X-Org-ID header', corsHeaders);
        const body = await request.json();
        const result = await processImportJob(env.DB, {
          orgId,
          channelId: body.channelId,
          provider: body.provider,
          rows: body.rows || [],
          importType: body.importType || 'orders',
          sourceName: body.sourceName || 'api_payload'
        });

        return json({ ok: true, result }, corsHeaders);
      }

      // 5. CSV Onboarding & Mapping Endpoint
      if (path === '/api/v1/import/csv' && request.method === 'POST') {
        if (!orgId) return jsonError(400, 'Missing X-Org-ID header', corsHeaders);
        const body = await request.json();
        const result = await processCsvImport(env.DB, {
          orgId,
          channelId: body.channelId,
          csvRows: body.csvRows || [],
          columnMapping: body.columnMapping || {},
          importType: body.importType || 'orders',
          sourceName: body.sourceName || 'custom_upload.csv'
        });

        return json({ ok: true, result }, corsHeaders);
      }

      // 6. Financial P&L Reporting Endpoint
      if (path === '/api/v1/reports/financial' && request.method === 'GET') {
        if (!orgId) return jsonError(400, 'Missing X-Org-ID header', corsHeaders);
        const start = url.searchParams.get('startDate');
        const end   = url.searchParams.get('endDate');
        const report = await getFinancialSummary(env.DB, orgId, start, end);
        return json({ ok: true, report }, corsHeaders);
      }

      // 7. Channel Performance Endpoint
      if (path === '/api/v1/reports/channels' && request.method === 'GET') {
        if (!orgId) return jsonError(400, 'Missing X-Org-ID header', corsHeaders);
        const channels = await getChannelBreakdown(env.DB, orgId);
        return json({ ok: true, channels }, corsHeaders);
      }

      // 8. Payout Reconciliation Endpoint
      if (path === '/api/v1/reconciliation/payouts' && request.method === 'GET') {
        if (!orgId) return jsonError(400, 'Missing X-Org-ID header', corsHeaders);
        const reconciliations = await reconcilePayouts(env.DB, orgId);
        return json({ ok: true, reconciliations }, corsHeaders);
      }

      return jsonError(404, 'Endpoint not found', corsHeaders);

    } catch (err) {
      console.error('SaaS API Error:', err);
      return jsonError(500, err.message || 'Internal Server Error', corsHeaders);
    }
  }
};

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function jsonError(status, message, headers) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}
