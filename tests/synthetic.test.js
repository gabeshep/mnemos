/**
 * Integration tests — GET /api/synthetic/onboarding
 *
 * Covers:
 *   1. Returns 503 with { ok: false, error: 'synthetic probe not configured' }
 *      when SYNTHETIC_TENANT_ID / SYNTHETIC_STATE_ID env vars are absent.
 *   2. Returns 200 with { ok: true, latencyMs: <number> } when env vars are
 *      set and a valid synthetic tenant + onboarding_state row exist in the DB.
 *
 * Test 1 does not require DATABASE_URL.
 * Test 2 requires DATABASE_URL and JWT_SECRET.
 * Requires JWT_SECRET because importing the app module validates it at load time.
 * Run with: JWT_SECRET=test-secret-key-for-testing-purposes-32chars node --test tests/synthetic.test.js
 */

import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[synthetic.test] JWT_SECRET not set or too short — skipping all tests.');
  process.exit(0);
}

import http from 'node:http';
import app from '../src/index.js';

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

let server;
let baseUrl;

function request(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
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
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let pool;
let syntheticTenantId;
let syntheticStateId;

const SLUG = 'synthetic-test-tenant-' + Date.now();

before(async () => {
  // Ensure the synthetic env vars are absent initially so test 1 exercises
  // the "not configured" branch without interference.
  delete process.env.SYNTHETIC_TENANT_ID;
  delete process.env.SYNTHETIC_STATE_ID;

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Only set up DB fixtures if DATABASE_URL is available
  if (process.env.DATABASE_URL) {
    const { pool: dbPool } = await import('../db/index.js');
    pool = dbPool;

    const resT = await pool.query(
      `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
      ['Synthetic Test Tenant', SLUG]
    );
    syntheticTenantId = resT.rows[0].id;

    const resS = await pool.query(
      `INSERT INTO onboarding_state (tenant_id, state) VALUES ($1, $2) RETURNING id`,
      [syntheticTenantId, JSON.stringify({ synthetic: false })]
    );
    syntheticStateId = resS.rows[0].id;
  }
});

after(async () => {
  delete process.env.SYNTHETIC_TENANT_ID;
  delete process.env.SYNTHETIC_STATE_ID;

  if (pool) {
    await pool.query(`DELETE FROM tenant WHERE slug = $1`, [SLUG]);
    await pool.end();
  }
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Test 1: returns 503 when env vars are absent
// ---------------------------------------------------------------------------

test('GET /api/synthetic/onboarding returns 503 when env vars absent', async () => {
  const res = await request('GET', '/api/synthetic/onboarding');

  assert.equal(res.status, 503, `Expected 503, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, false, 'Expected ok: false');
  assert.equal(
    res.body.error,
    'synthetic probe not configured',
    `Expected error message, got: ${res.body.error}`
  );
});

// ---------------------------------------------------------------------------
// Test 2: returns 200 with latencyMs when env vars are set and row exists
// ---------------------------------------------------------------------------

test('GET /api/synthetic/onboarding returns 200 with real DB fixture', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set — skipping synthetic probe DB test');
    return;
  }

  process.env.SYNTHETIC_TENANT_ID = syntheticTenantId;
  process.env.SYNTHETIC_STATE_ID = syntheticStateId;

  try {
    const res = await request('GET', '/api/synthetic/onboarding');

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.ok, true, `Expected ok: true, got: ${JSON.stringify(res.body)}`);
    assert.ok(
      typeof res.body.latencyMs === 'number',
      `Expected latencyMs to be a number, got: ${typeof res.body.latencyMs}`
    );
  } finally {
    delete process.env.SYNTHETIC_TENANT_ID;
    delete process.env.SYNTHETIC_STATE_ID;
  }
});
