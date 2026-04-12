/**
 * Integration tests — PUT /api/onboarding/state/:uuid
 *
 * Covers:
 *   1. 200 OK — same-tenant update succeeds
 *   2. 403 Forbidden — cross-tenant probe (record owned by another tenant)
 *   3. 404 Not Found — UUID does not exist in any tenant
 *   4. Audit log entry is written on 403
 *
 * Requires DATABASE_URL and JWT_SECRET to be set.
 * Run with: node --test tests/onboarding.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.warn('[onboarding.test] DATABASE_URL not set — skipping all tests.');
  process.exit(0);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[onboarding.test] JWT_SECRET not set or too short — skipping all tests.');
  process.exit(0);
}

import { pool } from '../db/index.js';
import bcrypt from 'bcryptjs';
import http from 'node:http';
import app from '../src/index.js';

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

let server;
let baseUrl;

function request(method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (cookie) options.headers['Cookie'] = cookie;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) {
    const match = c.match(/mnemos_auth=([^;]+)/);
    if (match) return `mnemos_auth=${match[1]}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SLUG_A = 'onboarding-test-tenant-a-' + Date.now();
const SLUG_B = 'onboarding-test-tenant-b-' + Date.now();
const PASSWORD = 'test-password-onboarding-123';

let tenantAId, tenantBId;
let cookieA, cookieB;
// UUID of an onboarding_state record owned by tenant B
let stateBId;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Insert two tenants (superuser bypasses RLS)
  const resA = await pool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Onboarding Test A', SLUG_A]
  );
  tenantAId = resA.rows[0].id;

  const resB = await pool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Onboarding Test B', SLUG_B]
  );
  tenantBId = resB.rows[0].id;

  // Insert one user per tenant
  const hash = await bcrypt.hash(PASSWORD, 12);
  await pool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3)`,
    [tenantAId, 'user@tenant-a.dev', hash]
  );
  await pool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3)`,
    [tenantBId, 'user@tenant-b.dev', hash]
  );

  // Log in both users to obtain cookies
  const loginA = await request('POST', '/api/auth/login', {
    body: { email: 'user@tenant-a.dev', password: PASSWORD, tenantSlug: SLUG_A },
  });
  cookieA = extractCookie(loginA.headers);

  const loginB = await request('POST', '/api/auth/login', {
    body: { email: 'user@tenant-b.dev', password: PASSWORD, tenantSlug: SLUG_B },
  });
  cookieB = extractCookie(loginB.headers);

  // Create an onboarding_state record owned by tenant B (direct pool insert as superuser)
  const stateRes = await pool.query(
    `INSERT INTO onboarding_state (tenant_id, state) VALUES ($1, $2) RETURNING id`,
    [tenantBId, JSON.stringify({ step: 1 })]
  );
  stateBId = stateRes.rows[0].id;

  // Create an onboarding_state record owned by tenant A for the 200 test
  const stateARes = await pool.query(
    `INSERT INTO onboarding_state (tenant_id, state) VALUES ($1, $2) RETURNING id`,
    [tenantAId, JSON.stringify({ step: 0 })]
  );
  // attach to test so the 200 test can reference it
  global._stateAId = stateARes.rows[0].id;
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

after(async () => {
  await pool.query(`DELETE FROM tenant WHERE slug IN ($1, $2)`, [SLUG_A, SLUG_B]);
  await pool.end();
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Test 1: same-tenant update returns 200
// ---------------------------------------------------------------------------

test('PUT /onboarding/state/:uuid same-tenant returns 200', async () => {
  const stateAId = global._stateAId;
  const res = await request('PUT', `/api/onboarding/state/${stateAId}`, {
    cookie: cookieA,
    body: { state: { step: 2, completed: true } },
  });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.id, stateAId);
});

// ---------------------------------------------------------------------------
// Test 2: cross-tenant probe returns 403
// ---------------------------------------------------------------------------

test('PUT /onboarding/state/:uuid cross-tenant returns 403', async () => {
  // cookieA is tenant A; stateBId belongs to tenant B
  const res = await request('PUT', `/api/onboarding/state/${stateBId}`, {
    cookie: cookieA,
    body: { state: { hacked: true } },
  });

  assert.equal(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'Forbidden');
});

// ---------------------------------------------------------------------------
// Test 3: missing UUID returns 404
// ---------------------------------------------------------------------------

test('PUT /onboarding/state/:uuid missing UUID returns 404', async () => {
  const nonExistentId = '00000000-0000-0000-0000-000000000000';
  const res = await request('PUT', `/api/onboarding/state/${nonExistentId}`, {
    cookie: cookieA,
    body: { state: { step: 1 } },
  });

  assert.equal(res.status, 404, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'Onboarding state not found');
});

// ---------------------------------------------------------------------------
// Test 4: audit log is written on 403 cross-tenant probe
// ---------------------------------------------------------------------------

test('PUT /onboarding/state/:uuid cross-tenant writes audit log entry', async () => {
  // Capture console.log output during the request
  const logLines = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logLines.push(args.join(' '));
    originalLog(...args);
  };

  try {
    await request('PUT', `/api/onboarding/state/${stateBId}`, {
      cookie: cookieA,
      body: { state: { sensitive: 'data', token: 'should-be-redacted' } },
    });
  } finally {
    console.log = originalLog;
  }

  const auditEntry = logLines
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .find((e) => e && e.event === 'security.authz.cross_tenant_probe');

  assert.ok(auditEntry, 'Audit log entry with event security.authz.cross_tenant_probe must be written');
  assert.equal(auditEntry.targetId, stateBId, 'Audit entry must record the targeted UUID');
  assert.equal(auditEntry.callerTenantId, tenantAId, 'Audit entry must record the caller tenant');

  // Verify body values are redacted (no plaintext strings from request body)
  const bodyStr = JSON.stringify(auditEntry.requestBody);
  assert.ok(!bodyStr.includes('should-be-redacted'), 'Token value must not appear in audit log');
  assert.ok(!bodyStr.includes('data'), 'Sensitive value must not appear in audit log');
  assert.ok(bodyStr.includes('[REDACTED]'), 'Redacted marker must appear in audit log body');
});
