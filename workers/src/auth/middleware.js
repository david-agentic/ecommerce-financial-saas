/**
 * Multi-Tenant Authentication & Server-Side Organization Authorization Middleware
 */

import { hashToken } from './crypto.js';

const ROLE_RANK = {
  viewer: 1,
  member: 2,
  admin:  3,
  owner:  4
};

export async function authenticateUser(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHENTICATED: Missing or invalid Authorization Bearer token');
  }

  const token = authHeader.substring(7).trim();
  if (!token) throw new Error('UNAUTHENTICATED: Empty authentication token');

  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();

  // Query Session & User
  const result = await env.DB.prepare(`
    SELECT s.id as session_id, s.user_id, s.expires_at, u.email, u.name, u.status
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'Active'
  `).bind(tokenHash, now).first();

  if (!result) {
    throw new Error('UNAUTHENTICATED: Session expired or invalid authentication token');
  }

  return {
    user: {
      id: result.user_id,
      email: result.email,
      name: result.name
    },
    session: {
      id: result.session_id,
      expiresAt: result.expires_at
    }
  };
}

export async function authorizeOrgMembership(env, userId, targetOrgId, minRole = 'viewer') {
  let membership;

  if (!targetOrgId) {
    membership = await env.DB.prepare(`
      SELECT m.id, m.org_id, m.user_id, m.role, o.name as org_name, o.base_currency, o.status as org_status
      FROM org_memberships m
      JOIN organizations o ON m.org_id = o.id
      WHERE m.user_id = ? AND o.status = 'Active'
      ORDER BY m.created_at ASC
      LIMIT 1
    `).bind(userId).first();
  } else {
    membership = await env.DB.prepare(`
      SELECT m.id, m.org_id, m.user_id, m.role, o.name as org_name, o.base_currency, o.status as org_status
      FROM org_memberships m
      JOIN organizations o ON m.org_id = o.id
      WHERE m.user_id = ? AND m.org_id = ? AND o.status = 'Active'
    `).bind(userId, targetOrgId).first();
  }

  if (!membership) {
    throw new Error(`FORBIDDEN: User does not have authorized membership access to organization '${targetOrgId}'`);
  }

  const userRank = ROLE_RANK[membership.role] || 0;
  const requiredRank = ROLE_RANK[minRole] || 1;

  if (userRank < requiredRank) {
    throw new Error(`FORBIDDEN: Operation requires '${minRole}' role (current role: '${membership.role}')`);
  }

  return membership;
}
