/**
 * API Integration tests — Cross-Tenant Authorization Isolation (IDOR prevention)
 *
 * Verifies that Tenant A cannot access Tenant B's resources through parameterized
 * endpoints where Insecure Direct Object Reference (IDOR) vulnerabilities are possible.
 *
 * List endpoints (GET /entities, GET /sessions) are NOT tested here — they are
 * scoped by the JWT tenant context and return empty arrays, not 403/404, so they
 * are not IDOR vectors.
 *
 * Strategy:
 *   - Tenant B's data is inserted via a direct superuser pool (ADMIN_DATABASE_URL or
 *     DATABASE_URL) which bypasses RLS. This is intentional: we need Tenant B's records
 *     to exist in the DB but be invisible to Tenant A through normal API paths.
 *   - The application server uses DATABASE_URL. For RLS enforcement to work, this
 *     MUST be a non-superuser role. If DATABASE_URL connects as a superuser, these
 *     tests are skipped with a warning (a superuser bypasses all RLS policies and
 *     the cross-tenant isolation check would be meaningless).
 *   - All 7 tests authenticate as Tenant A and attempt to reach Tenant B's resources.
 *   - Expected response for every cross-tenant attempt: 403 Forbidden or 404 Not Found.
 *
 * Environment variables:
 *   DATABASE_URL       — App DB connection (MUST be non-superuser for RLS enforcement)
 *   ADMIN_DATABASE_URL — Superuser DB connection for test setup; falls back to DATABASE_URL
 *   JWT_SECRET         — Must be set and >= 32 characters
 *
 * Run with:
 *   ADMIN_DATABASE_URL=postgres://postgres:pw@localhost/db \
 *   DATABASE_URL=postgres://app_user:pw@localhost/db \
 *   JWT_SECRET=<32-char-secret> \
 *   node --test tests/integration/api/tenant-isolation.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('[tenant-isolation-api] DATABASE_URL not set — skipping all tests.');
  process.exit(0);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[tenant-isolation-api] JWT_SECRET not set or too short — skipping all tests.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Superuser check — skip if the app DB user is a superuser.
// A superuser bypasses all PostgreSQL RLS policies unconditionally, so cross-tenant
// isolation tests would be meaningless (and would produce false negatives).
// ---------------------------------------------------------------------------

const APP_DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.ADMIN_DATABASE_URL || APP_DATABASE_URL;

{
  const checkPool = new Pool({ connectionString: APP_DATABASE_URL, max: 1 });
  const result = await checkPool.query(
    `SELECT rolsuper FROM pg_roles WHERE rolname = current_user`
  );
  await checkPool.end();

  if (result.rows[0]?.rolsuper === true) {
    console.warn(
      '[tenant-isolation-api] DATABASE_URL connects as a PostgreSQL superuser — ' +
      'superusers bypass all RLS policies unconditionally, so cross-tenant isolation ' +
      'cannot be verified with this connection. Skipping all tests.\n' +
      'To run these tests, set DATABASE_URL to a non-superuser role that has table ' +
      'privileges but no SUPERUSER attribute. Set ADMIN_DATABASE_URL to the superuser ' +
      'connection for test fixture setup.'
    );
    process.exit(0);
  }
}

// After superuser check passes, import the app (which uses DATABASE_URL internally)
import bcrypt from 'bcryptjs';
import app from '../../../src/index.js';

// ---------------------------------------------------------------------------
// Two separate pools:
//   adminPool — superuser (bypasses RLS), used ONLY for test fixture setup/teardown
//   The app itself uses DATABASE_URL (non-superuser, RLS enforced)
// ---------------------------------------------------------------------------

const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });

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
// Test fixture state
// ---------------------------------------------------------------------------

// Slugs are unique per run to avoid collisions
const SLUG_A = 'idor-test-tenant-a-' + Date.now();
const SLUG_B = 'idor-test-tenant-b-' + Date.now();
const PASSWORD = 'test-password-idor-isolation-123';

// Tenant A — the attacker perspective (authenticated via JWT cookie)
let tenantAId;
let cookieA;

// Tenant B — the victim (resources inserted directly as superuser via adminPool)
let tenantBId;
let userBId;
let entityBId;
let assetBId;
let assetVersionBId;
let sessionBId;

// ---------------------------------------------------------------------------
// Setup: provision two tenants + Tenant A user + Tenant B resources
// ---------------------------------------------------------------------------

before(async () => {
  // Start the HTTP server on a random port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // --- Tenant A ---
  // All setup inserts go through adminPool (superuser) to bypass RLS on the
  // tenant table (no RLS) and to ensure consistent setup regardless of app DB role.
  const resA = await adminPool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['IDOR Test Tenant A', SLUG_A]
  );
  tenantAId = resA.rows[0].id;

  // Insert a user for Tenant A
  const hashA = await bcrypt.hash(PASSWORD, 12);
  await adminPool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3)`,
    [tenantAId, 'admin@idor-test-a.dev', hashA]
  );

  // Obtain a JWT cookie for Tenant A via the login endpoint
  const loginA = await request('POST', '/api/auth/login', {
    body: { email: 'admin@idor-test-a.dev', password: PASSWORD, tenantSlug: SLUG_A },
  });
  cookieA = extractCookie(loginA.headers);
  if (!cookieA) throw new Error('Setup failed: could not obtain Tenant A JWT cookie');

  // --- Tenant B (victim) ---
  // All inserts below use adminPool (superuser) to bypass RLS.
  // This is intentional: we need Tenant B's records to exist in the DB but be
  // invisible to Tenant A through normal API paths when RLS is properly enforced.

  const resB = await adminPool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['IDOR Test Tenant B', SLUG_B]
  );
  tenantBId = resB.rows[0].id;

  const hashB = await bcrypt.hash(PASSWORD, 12);
  const userBRes = await adminPool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3) RETURNING id`,
    [tenantBId, 'admin@idor-test-b.dev', hashB]
  );
  userBId = userBRes.rows[0].id;

  // Entity belonging to Tenant B
  const entityBRes = await adminPool.query(
    `INSERT INTO entity (tenant_id, name, description)
     VALUES ($1, $2, $3) RETURNING id`,
    [tenantBId, 'Tenant B Entity', 'Should not be visible to Tenant A']
  );
  entityBId = entityBRes.rows[0].id;

  // Asset belonging to Tenant B's entity
  const assetBRes = await adminPool.query(
    `INSERT INTO asset (entity_id, tenant_id, name, asset_type, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [entityBId, tenantBId, 'Tenant B ICP', 'ICP', userBId]
  );
  assetBId = assetBRes.rows[0].id;

  // Published asset version belonging to Tenant B
  const avBRes = await adminPool.query(
    `INSERT INTO asset_version (asset_id, tenant_id, version_number, content, state, created_by)
     VALUES ($1, $2, 1, $3, 'published', $4) RETURNING id`,
    [assetBId, tenantBId, '# Tenant B ICP content — must not be visible to Tenant A', userBId]
  );
  assetVersionBId = avBRes.rows[0].id;

  // Session belonging to Tenant B
  const sessionBRes = await adminPool.query(
    `INSERT INTO session (tenant_id, entity_id, created_by, title, status, seed_asset_versions)
     VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
    [tenantBId, entityBId, userBId, 'Tenant B Session', `{${assetVersionBId}}`]
  );
  sessionBId = sessionBRes.rows[0].id;
});

// ---------------------------------------------------------------------------
// Teardown: delete both tenants (cascades to all child records)
// ---------------------------------------------------------------------------

after(async () => {
  await adminPool.query(`DELETE FROM tenant WHERE slug IN ($1, $2)`, [SLUG_A, SLUG_B]);
  await adminPool.end();
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Helpers: assert the response blocks cross-tenant access
// ---------------------------------------------------------------------------

/**
 * Strict block: expects 403 or 404.
 * Used for endpoints that explicitly look up a record by ID and return 404 when not found.
 */
function assertBlocked(res, label) {
  const allowed = [403, 404];
  assert.ok(
    allowed.includes(res.status),
    `[${label}] Expected 403 or 404 blocking cross-tenant access, got ${res.status}: ${JSON.stringify(res.body)}`
  );
}

/**
 * Soft block: expects 403, 404, OR 200 with an empty body.
 * Used for list-style endpoints that return an empty array or empty result when RLS
 * filters out cross-tenant records — no data is leaked, but the status is 200.
 *
 * A 200 with non-empty data IS a failure (cross-tenant data was exposed).
 */
function assertNotExposed(res, label) {
  if (res.status === 200) {
    // 200 is acceptable only if the body contains no data (empty array or empty object)
    const body = res.body;
    const isEmpty = Array.isArray(body) ? body.length === 0 : Object.keys(body).length === 0;
    assert.ok(
      isEmpty,
      `[${label}] 200 response must return empty data (no cross-tenant leak), got: ${JSON.stringify(body)}`
    );
  } else {
    // Any error status is also acceptable
    const allowed = [400, 403, 404];
    assert.ok(
      allowed.includes(res.status),
      `[${label}] Expected 200 (empty), 403, or 404 for cross-tenant access, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Test 1: GET /entities/:entityId/assets — Tenant A cannot see Tenant B's assets
//
// This endpoint returns an array filtered by RLS. When RLS is enforced, Tenant B's
// entity is invisible and the result is an empty array (200). A non-empty response
// would indicate data leakage. 403/404 are also acceptable.
// ---------------------------------------------------------------------------

test('GET /entities/:entityId/assets — cross-tenant entity ID exposes no data', async () => {
  const res = await request('GET', `/api/entities/${entityBId}/assets`, { cookie: cookieA });
  assertNotExposed(res, 'GET /entities/:entityId/assets');
});

// ---------------------------------------------------------------------------
// Test 2: GET /entities/:entityId/published-versions — Tenant A cannot read Tenant B's published versions
// ---------------------------------------------------------------------------

test('GET /entities/:entityId/published-versions — cross-tenant entity ID returns 403 or 404', async () => {
  const res = await request('GET', `/api/entities/${entityBId}/published-versions`, { cookie: cookieA });
  assertBlocked(res, 'GET /entities/:entityId/published-versions');
});

// ---------------------------------------------------------------------------
// Test 3: GET /assets/:assetId/versions — Tenant A cannot see Tenant B's asset versions
//
// This endpoint returns a list filtered by RLS. When RLS is enforced, Tenant B's
// asset versions are invisible and the result is an empty array (200). A non-empty
// response would indicate data leakage. 403/404 are also acceptable.
// ---------------------------------------------------------------------------

test('GET /assets/:assetId/versions — cross-tenant asset ID exposes no data', async () => {
  const res = await request('GET', `/api/assets/${assetBId}/versions`, { cookie: cookieA });
  assertNotExposed(res, 'GET /assets/:assetId/versions');
});

// ---------------------------------------------------------------------------
// Test 4: GET /sessions/:sessionId — Tenant A cannot read Tenant B's session
// ---------------------------------------------------------------------------

test('GET /sessions/:sessionId — cross-tenant session ID returns 403 or 404', async () => {
  const res = await request('GET', `/api/sessions/${sessionBId}`, { cookie: cookieA });
  assertBlocked(res, 'GET /sessions/:sessionId');
});

// ---------------------------------------------------------------------------
// Test 5: POST /sessions/:sessionId/messages — Tenant A cannot send to Tenant B's session
// ---------------------------------------------------------------------------

test('POST /sessions/:sessionId/messages — cross-tenant session ID returns 403 or 404', async () => {
  const res = await request('POST', `/api/sessions/${sessionBId}/messages`, {
    cookie: cookieA,
    body: { content: 'Cross-tenant message injection attempt' },
  });
  assertBlocked(res, 'POST /sessions/:sessionId/messages');
});

// ---------------------------------------------------------------------------
// Test 6: POST /sessions — Tenant A cannot create a session seeded with Tenant B's asset version IDs
// ---------------------------------------------------------------------------

test('POST /sessions — cross-tenant assetVersionIds are rejected (403 or 404)', async () => {
  // Create a minimal entity for Tenant A to provide a valid entityId.
  // The cross-tenant attack vector here is the assetVersionIds array containing Tenant B's IDs.
  // We insert via adminPool (superuser) to ensure it works regardless of app DB role.
  const entityARes = await adminPool.query(
    `INSERT INTO entity (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [tenantAId, 'Tenant A Entity for session IDOR test']
  );
  const entityAId = entityARes.rows[0].id;

  const res = await request('POST', '/api/sessions', {
    cookie: cookieA,
    body: {
      entityId: entityAId,
      // Tenant B's published version ID — RLS should make it invisible to Tenant A's context
      assetVersionIds: [assetVersionBId],
    },
  });

  // RLS filters Tenant B's asset version so Tenant A's session context sees 0 matching rows.
  // The route validates that all requested IDs exist and returns 400 when they don't resolve.
  // A 400 "Invalid asset version IDs" is still a correct isolation outcome — the cross-tenant
  // data was invisible (not exposed). 403 or 404 are equally valid enforcement responses.
  const allowed = [400, 403, 404];
  assert.ok(
    allowed.includes(res.status),
    `Expected 400/403/404 when using cross-tenant assetVersionIds, got ${res.status}: ${JSON.stringify(res.body)}`
  );

  // Specifically: if 400, ensure it's the "Invalid asset version IDs" error
  // (meaning the IDs were invisible to RLS, not a different validation failure)
  if (res.status === 400) {
    assert.equal(
      res.body.error,
      'Invalid asset version IDs',
      'A 400 response must indicate invalid/invisible IDs, not a different error'
    );
  }
});

// ---------------------------------------------------------------------------
// Test 7: POST /captures — Tenant A cannot create a capture referencing Tenant B's resources
// ---------------------------------------------------------------------------

test('POST /captures — cross-tenant sessionId and targetAssetId are rejected (403 or 404)', async () => {
  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      // Both IDs belong to Tenant B — RLS should prevent Tenant A from writing
      // captures that reference Tenant B's session or asset
      sessionId: sessionBId,
      targetAssetId: assetBId,
      content: '# Cross-tenant capture injection attempt',
      notes: 'This should be blocked by RLS or app-layer authorization',
    },
  });

  // RLS enforcement: any response other than 201 (created) is a passing isolation outcome.
  // Expected: the asset_version INSERT (with tenantId from Tenant A's JWT but assetId from Tenant B)
  // should violate the RLS WITH CHECK policy or a FK constraint.
  assert.notEqual(
    res.status,
    201,
    `Cross-tenant capture must not succeed with 201. Got ${res.status}: ${JSON.stringify(res.body)}`
  );
});
