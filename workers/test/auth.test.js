/**
 * Multi-Tenant Authentication & Server-Side Organization Authorization Automated Test Suite.
 */

import assert from 'assert';
import { test, describe } from 'node:test';
import { createMockSaaSDb } from './mockDb.js';
import workerRouter           from '../src/index.js';
import { hashPassword, verifyPassword } from '../src/auth/crypto.js';

describe('Phase G: Multi-Tenant Authentication, Authorization & Security', () => {

  test('1. User Sign Up & Onboarding: Creates user, org, owner membership, and returns token', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    const req = new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'merchant@alpha.com',
        name: 'Alice Merchant',
        password: 'SecurePassword123!',
        orgName: 'Alpha Store Ltd',
        currency: 'GBP'
      })
    });

    const res = await workerRouter.fetch(req, env, {});
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.token, 'Must return session token');
    assert.strictEqual(body.user.email, 'merchant@alpha.com');
    assert.strictEqual(body.org.name, 'Alpha Store Ltd');
    assert.strictEqual(body.org.role, 'owner');

    // Verify Password in Database is PBKDF2 Hashed (not plaintext)
    const storedUser = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(body.user.id).first();
    assert.ok(storedUser.password_hash.includes(':'), 'Hash must contain salt:hash separator');
    assert.notStrictEqual(storedUser.password_hash, 'SecurePassword123!');
  });

  test('2. Password Hashing & Verification: Correct password succeeds, wrong password fails', async () => {
    const hash = await hashPassword('MySecretPass123');
    assert.strictEqual(await verifyPassword('MySecretPass123', hash), true);
    assert.strictEqual(await verifyPassword('WrongPassword', hash), false);
  });

  test('3. Login Flow: Correct credentials return session token & authorized orgs list', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    // Signup first
    const signupReq = new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@beta.com', name: 'Bob', password: 'PassWord456!', orgName: 'Beta Store' })
    });
    await workerRouter.fetch(signupReq, env, {});

    // Login with correct password
    const loginReq = new Request('https://fin-saas.app/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@beta.com', password: 'PassWord456!' })
    });

    const res = await workerRouter.fetch(loginReq, env, {});
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.token);
    assert.strictEqual(body.orgs.length, 1);
    assert.strictEqual(body.orgs[0].name, 'Beta Store');

    // Login with wrong password
    const badReq = new Request('https://fin-saas.app/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@beta.com', password: 'WrongPassword' })
    });
    const badRes = await workerRouter.fetch(badReq, env, {});
    assert.strictEqual(badRes.status, 401);
  });

  test('4. Server-Side Organization Access Control: User CANNOT access Org B by changing X-Org-ID header', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    // User A in Org A
    const signupA = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'usera@alpha.com', password: 'Password123!', orgName: 'Org Alpha' })
    }), env, {})).json();

    // User B in Org B
    const signupB = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'userb@beta.com', password: 'Password123!', orgName: 'Org Beta' })
    }), env, {})).json();

    const tokenA = signupA.token;
    const orgAId = signupA.org.id;
    const orgBId = signupB.org.id;

    // User A requests Org A (Authorized) -> 200 OK
    const reqA = new Request(`https://fin-saas.app/api/v1/reports/financial?orgId=${orgAId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}`, 'X-Org-ID': orgAId }
    });
    const resA = await workerRouter.fetch(reqA, env, {});
    assert.strictEqual(resA.status, 200);

    // User A manually changes X-Org-ID to Org B (Unauthorized Cross-Tenant Attempt) -> REJECTED 403 Forbidden!
    const reqAttack = new Request(`https://fin-saas.app/api/v1/reports/financial?orgId=${orgBId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}`, 'X-Org-ID': orgBId }
    });
    const resAttack = await workerRouter.fetch(reqAttack, env, {});
    assert.strictEqual(resAttack.status, 403, 'Must reject unauthorized tenant switching with 403 Forbidden');

    const errBody = await resAttack.json();
    assert.strictEqual(errBody.ok, false);
    assert.ok(errBody.error.includes('FORBIDDEN'), 'Error message must state FORBIDDEN');
  });

  test('5. Role Authorization: Viewer role cannot perform Admin channel connections', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    // Signup User (Owner)
    const signup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@store.com', password: 'Password123!', orgName: 'Role Test Store' })
    }), env, {})).json();

    // Create Viewer User
    const viewerSignup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'viewer@store.com', password: 'Password123!', orgName: 'Viewer Secondary Org' })
    }), env, {})).json();

    // Grant Viewer role to viewerUser in Role Test Store (Org A)
    await db.prepare(`
      INSERT INTO org_memberships (id, org_id, user_id, role) VALUES ('mem_viewer', ?, ?, 'viewer')
    `).bind(signup.org.id, viewerSignup.user.id).run();

    // Viewer attempts to connect channel on Org A (Requires 'admin' role) -> 403 Forbidden
    const connectReq = new Request('https://fin-saas.app/api/v1/channels/connect', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${viewerSignup.token}`,
        'X-Org-ID': signup.org.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'shopify', channelName: 'New Store' })
    });

    const res = await workerRouter.fetch(connectReq, env, {});
    assert.strictEqual(res.status, 403, 'Viewer cannot perform channel connection');
  });

  test('6. Logout Flow: Session token revocation invalidates future requests', async () => {
    const db = createMockSaaSDb();
    const env = { DB: db };

    const signup = await (await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'logout@test.com', password: 'Password123!', orgName: 'Logout Org' })
    }), env, {})).json();

    const token = signup.token;

    // Logout
    const logoutRes = await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/logout', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    }), env, {});

    assert.strictEqual(logoutRes.status, 200);

    // Subsequent request with revoked token fails -> 401 Unauthorized
    const meRes = await workerRouter.fetch(new Request('https://fin-saas.app/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    }), env, {});

    assert.strictEqual(meRes.status, 401);
  });

});
