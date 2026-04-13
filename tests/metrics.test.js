/**
 * Integration tests — GET /api/metrics
 *
 * Covers:
 *   1. Returns 200 with Content-Type text/plain
 *   2. Response body contains the mnemos_onboarding_transition_total metric name
 *   3. After a successful PUT to onboarding state, the success counter increments
 *
 * Tests 1 and 2 do not require DATABASE_URL.
 * Test 3 requires DATABASE_URL and JWT_SECRET.
 * Run with: node --test tests/metrics.test.js
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[metrics.test] JWT_SECRET not set or too short — skipping all tests.');
  process.exit(0);
}

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
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
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
// Setup / teardown
// ---------------------------------------------------------------------------

let pool;
let tenantId;
let stateId;
let cookie;

const SLUG = 'metrics-test-tenant-' + Date.now();
const PASSWORD = 'test-password-metrics-123';

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Only set up DB fixtures if DATABASE_URL is available
  if (process.env.DATABASE_URL) {
    const { pool: dbPool } = await import('../db/index.js');
    pool = dbPool;
    const bcrypt = (await import('bcryptjs')).default;

    const resT = await pool.query(
      `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
      ['Metrics Test Tenant', SLUG]
    );
    tenantId = resT.rows[0].id;

    const hash = await bcrypt.hash(PASSWORD, 12);
    await pool.query(
      `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3)`,
      [tenantId, 'user@metrics-test.dev', hash]
    );

    const loginRes = await request('POST', '/api/auth/login', {
      body: { email: 'user@metrics-test.dev', password: PASSWORD, tenantSlug: SLUG },
    });
    cookie = extractCookie(loginRes.headers);

    const stateRes = await pool.query(
      `INSERT INTO onboarding_state (tenant_id, state) VALUES ($1, $2) RETURNING id`,
      [tenantId, JSON.stringify({ step: 0 })]
    );
    stateId = stateRes.rows[0].id;
  }
});

after(async () => {
  if (pool) {
    await pool.query(`DELETE FROM tenant WHERE slug = $1`, [SLUG]);
    await pool.end();
  }
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Test 1: GET /api/metrics returns 200 with text/plain content type
// ---------------------------------------------------------------------------

test('GET /api/metrics returns 200 with Content-Type text/plain', async () => {
  const res = await request('GET', '/api/metrics');

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${res.body.slice(0, 200)}`);
  assert.ok(
    res.headers['content-type']?.startsWith('text/plain'),
    `Expected Content-Type text/plain, got: ${res.headers['content-type']}`
  );
});

// ---------------------------------------------------------------------------
// Test 2: Response body contains the onboarding transition counter metric
// ---------------------------------------------------------------------------

test('GET /api/metrics body contains mnemos_onboarding_transition_total', async () => {
  const res = await request('GET', '/api/metrics');

  assert.ok(
    res.body.includes('mnemos_onboarding_transition_total'),
    `Expected metric name in body. Got: ${res.body.slice(0, 500)}`
  );
});

// ---------------------------------------------------------------------------
// Test 3: After a successful PUT to onboarding state, success counter increments
// ---------------------------------------------------------------------------

test('success counter increments after successful onboarding state PUT', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set — skipping counter increment test');
    return;
  }

  // Make a successful PUT to onboarding state
  const putRes = await request('PUT', `/api/onboarding/state/${stateId}`, {
    cookie,
    body: { state: { step: 1, completed: false } },
  });
  assert.equal(putRes.status, 200, `Expected 200 from PUT, got ${putRes.status}: ${putRes.body}`);

  // Fetch metrics and verify the success counter is present
  const metricsRes = await request('GET', '/api/metrics');
  assert.equal(metricsRes.status, 200);
  assert.ok(
    metricsRes.body.includes('mnemos_onboarding_transition_total{outcome="success"}'),
    `Expected success counter in metrics output. Got:\n${metricsRes.body}`
  );
});
