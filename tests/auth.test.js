/**
 * Integration tests — email/password authentication and RBAC
 *
 * Requires DATABASE_URL and JWT_SECRET to be set.
 * Run with: JWT_SECRET=test-secret-key-for-testing-purposes-32chars node --test tests/auth.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.warn('[auth.test] DATABASE_URL not set — skipping all tests.');
  process.exit(0);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[auth.test] JWT_SECRET not set or too short — skipping all tests.');
  process.exit(0);
}

import { pool } from '../db/index.js';
import bcrypt from 'bcryptjs';

// We'll import the app after setting up env
import app from '../src/index.js';
import http from 'node:http';

// ---------------------------------------------------------------------------
// Helper to make HTTP requests against the test server
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
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

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

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_TENANT_SLUG = 'auth-test-tenant-' + Date.now();
const ADMIN_EMAIL = 'admin@auth-test.dev';
const ADMIN_PASSWORD = 'test-admin-password-123';
const EDITOR_EMAIL = 'editor@auth-test.dev';
const EDITOR_PASSWORD = 'test-editor-password-123';
const VIEWER_EMAIL = 'viewer@auth-test.dev';
const VIEWER_PASSWORD = 'test-viewer-password-123';

let tenantId;
let adminCookie;
let editorCookie;
let viewerCookie;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

before(async () => {
  // Start server
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Insert test tenant (bypass RLS as superuser)
  const tenantRes = await pool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Auth Test Tenant', TEST_TENANT_SLUG]
  );
  tenantId = tenantRes.rows[0].id;

  // Insert admin user
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await pool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3)`,
    [tenantId, ADMIN_EMAIL, adminHash]
  );

  // Insert editor user
  const editorHash = await bcrypt.hash(EDITOR_PASSWORD, 12);
  await pool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'editor', $3)`,
    [tenantId, EDITOR_EMAIL, editorHash]
  );

  // Insert viewer user
  const viewerHash = await bcrypt.hash(VIEWER_PASSWORD, 12);
  await pool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'viewer', $3)`,
    [tenantId, VIEWER_EMAIL, viewerHash]
  );
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

after(async () => {
  await pool.query(`DELETE FROM tenant WHERE slug = $1`, [TEST_TENANT_SLUG]);
  await pool.end();
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Helper to extract Set-Cookie header value
// ---------------------------------------------------------------------------

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
// Tests: Login
// ---------------------------------------------------------------------------

test('login success returns 200 and sets cookie', async () => {
  const res = await request('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });

  assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.email, ADMIN_EMAIL);
  assert.equal(res.body.role, 'admin');
  assert.equal(res.body.tenantId, tenantId);
  assert.ok(!('password_hash' in res.body), 'password_hash must not be in response');

  adminCookie = extractCookie(res.headers);
  assert.ok(adminCookie, 'mnemos_auth cookie must be set');
});

test('login with wrong password returns 401', async () => {
  const res = await request('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: 'wrong-password', tenantSlug: TEST_TENANT_SLUG },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials');
});

test('login with non-existent tenant slug returns 401', async () => {
  const res = await request('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantSlug: 'no-such-tenant' },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials');
});

test('login with non-existent email returns 401', async () => {
  const res = await request('POST', '/api/auth/login', {
    body: { email: 'nobody@nowhere.dev', password: ADMIN_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials');
});

// ---------------------------------------------------------------------------
// Tests: /me
// ---------------------------------------------------------------------------

test('GET /me with valid cookie returns user (no password_hash)', async () => {
  // Ensure we have an admin cookie (login test may have run, but rerun to be safe)
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });
  const cookie = extractCookie(loginRes.headers);

  const res = await request('GET', '/api/auth/me', { cookie });
  assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.email, ADMIN_EMAIL);
  assert.ok(!('password_hash' in res.body), 'password_hash must not be in response');
});

test('GET /me without cookie returns 401', async () => {
  const res = await request('GET', '/api/auth/me');
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Tests: Logout
// ---------------------------------------------------------------------------

test('POST /auth/logout returns 200 and clears cookie', async () => {
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });
  const cookie = extractCookie(loginRes.headers);

  const res = await request('POST', '/api/auth/logout', { cookie });
  assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);

  // The Set-Cookie header should clear the cookie
  const setCookie = res.headers['set-cookie'];
  if (setCookie) {
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    assert.ok(
      cookieStr.includes('mnemos_auth=') && (cookieStr.includes('Expires') || cookieStr.includes('mnemos_auth=;')),
      'Cookie should be cleared'
    );
  }
});

// ---------------------------------------------------------------------------
// Tests: POST /users (RBAC)
// ---------------------------------------------------------------------------

test('POST /users as admin creates user and returns 201', async () => {
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });
  const cookie = extractCookie(loginRes.headers);

  const res = await request('POST', '/api/users', {
    cookie,
    body: { email: 'newuser@auth-test.dev', password: 'new-user-password-123', role: 'viewer' },
  });

  assert.equal(res.status, 201, `Expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.email, 'newuser@auth-test.dev');
  assert.equal(res.body.role, 'viewer');
  assert.ok(!('password_hash' in res.body), 'password_hash must not be in response');
});

test('POST /users as editor returns 403', async () => {
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: EDITOR_EMAIL, password: EDITOR_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });
  const cookie = extractCookie(loginRes.headers);

  const res = await request('POST', '/api/users', {
    cookie,
    body: { email: 'another@auth-test.dev', password: 'password-123', role: 'viewer' },
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Forbidden');
});

test('POST /users as viewer returns 403', async () => {
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: VIEWER_EMAIL, password: VIEWER_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });
  const cookie = extractCookie(loginRes.headers);

  const res = await request('POST', '/api/users', {
    cookie,
    body: { email: 'another2@auth-test.dev', password: 'password-123', role: 'viewer' },
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Forbidden');
});

test('POST /users with duplicate email returns 409', async () => {
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });
  const cookie = extractCookie(loginRes.headers);

  // First insert
  await request('POST', '/api/users', {
    cookie,
    body: { email: 'duplicate@auth-test.dev', password: 'password-123', role: 'viewer' },
  });

  // Duplicate
  const res = await request('POST', '/api/users', {
    cookie,
    body: { email: 'duplicate@auth-test.dev', password: 'password-123', role: 'viewer' },
  });

  assert.equal(res.status, 409, `Expected 409 got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'Email already exists');
});

test('POST /users with invalid role returns 400', async () => {
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantSlug: TEST_TENANT_SLUG },
  });
  const cookie = extractCookie(loginRes.headers);

  const res = await request('POST', '/api/users', {
    cookie,
    body: { email: 'badrole@auth-test.dev', password: 'password-123', role: 'superuser' },
  });

  assert.equal(res.status, 400, `Expected 400 got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'Invalid role');
});
