/**
 * Authentication & SaaS Customer Onboarding Routes
 */

import { hashPassword, verifyPassword, generateToken, hashToken } from './crypto.js';
import { authenticateUser } from './middleware.js';

export async function handleAuthRoutes(request, env, path) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Org-ID'
  };

  // 1. Sign Up & Automated Onboarding
  if (path === '/api/v1/auth/signup' && request.method === 'POST') {
    const body = await request.json();
    const email    = String(body.email || '').trim().toLowerCase();
    const name     = String(body.name || '').trim();
    const password = String(body.password || '');
    const orgName  = String(body.orgName || `${name}'s Organization`).trim();
    const currency = String(body.currency || 'GBP').toUpperCase();

    if (!email || !email.includes('@')) return jsonError(400, 'Valid email address required', corsHeaders);
    if (!password || password.length < 8) return jsonError(400, 'Password must be at least 8 characters long', corsHeaders);

    // Check existing user
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return jsonError(400, 'Email address already registered', corsHeaders);

    const userId  = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orgId   = `org_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const memId   = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sesId   = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const passHash = await hashPassword(password);

    // Create User, Org, and Membership
    await env.DB.prepare(`
      INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)
    `).bind(userId, email, name, passHash).run();

    await env.DB.prepare(`
      INSERT INTO organizations (id, name, base_currency) VALUES (?, ?, ?)
    `).bind(orgId, orgName, currency).run();

    await env.DB.prepare(`
      INSERT INTO org_memberships (id, org_id, user_id, role) VALUES (?, ?, ?, 'owner')
    `).bind(memId, orgId, userId).run();

    // Create Session Token
    const rawToken  = generateToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)
    `).bind(sesId, userId, tokenHash, expiresAt).run();

    return json({
      ok: true,
      token: rawToken,
      user: { id: userId, email, name },
      org: { id: orgId, name: orgName, currency, role: 'owner' }
    }, corsHeaders);
  }

  // 2. Login
  if (path === '/api/v1/auth/login' && request.method === 'POST') {
    const body = await request.json();
    const email    = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) return jsonError(400, 'Email and password required', corsHeaders);

    const user = await env.DB.prepare(`
      SELECT id, email, name, password_hash, status FROM users WHERE email = ?
    `).bind(email).first();

    if (!user || user.status !== 'Active') return jsonError(401, 'Invalid credentials', corsHeaders);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return jsonError(401, 'Invalid credentials', corsHeaders);

    // Get User's Authorized Organizations
    const orgs = await env.DB.prepare(`
      SELECT o.id, o.name, o.base_currency, m.role
      FROM org_memberships m
      JOIN organizations o ON m.org_id = o.id
      WHERE m.user_id = ? AND o.status = 'Active'
    `).bind(user.id).all();

    // Issue Session Token
    const rawToken  = generateToken();
    const tokenHash = await hashToken(rawToken);
    const sesId     = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)
    `).bind(sesId, user.id, tokenHash, expiresAt).run();

    return json({
      ok: true,
      token: rawToken,
      user: { id: user.id, email: user.email, name: user.name },
      orgs: orgs.results || []
    }, corsHeaders);
  }

  // 3. Me (Current User & Authorized Orgs)
  if (path === '/api/v1/auth/me' && request.method === 'GET') {
    const { user } = await authenticateUser(request, env);

    const orgs = await env.DB.prepare(`
      SELECT o.id, o.name, o.base_currency, m.role
      FROM org_memberships m
      JOIN organizations o ON m.org_id = o.id
      WHERE m.user_id = ? AND o.status = 'Active'
    `).bind(user.id).all();

    return json({
      ok: true,
      user,
      orgs: orgs.results || []
    }, corsHeaders);
  }

  // 4. Logout
  if (path === '/api/v1/auth/logout' && request.method === 'POST') {
    const { session } = await authenticateUser(request, env);
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(session.id).run();
    return json({ ok: true, message: 'Logged out successfully' }, corsHeaders);
  }

  return null;
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function jsonError(status, message, headers) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
