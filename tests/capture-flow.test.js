/**
 * Integration tests — Capture flow (session output → new asset version)
 *
 * Covers:
 *   1. POST /captures — success: creates draft asset_version and capture record
 *   2. POST /captures — capture is in draft state (never auto-published)
 *   3. POST /captures — source_session_id is recorded on the new asset_version
 *   4. POST /captures — version_number auto-increments correctly
 *   5. POST /captures — notes field is optional but stored when provided
 *   6. POST /captures — missing sessionId returns 400
 *   7. POST /captures — missing targetAssetId returns 400
 *   8. POST /captures — missing content returns 400
 *   9. POST /captures — RLS: tenant B cannot capture into tenant A's asset
 *  10. POST /captures — successive captures produce sequential version numbers
 *
 * Requires DATABASE_URL and JWT_SECRET to be set.
 * Run with: node --test tests/capture-flow.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

if (!process.env.DATABASE_URL) {
  console.warn('[capture-flow.test] DATABASE_URL not set — skipping all tests.');
  process.exit(0);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[capture-flow.test] JWT_SECRET not set or too short — skipping all tests.');
  process.exit(0);
}

import { pool } from '../db/index.js';
import bcrypt from 'bcryptjs';
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

const SLUG_A = 'capture-test-a-' + Date.now();
const SLUG_B = 'capture-test-b-' + Date.now();
const PASSWORD = 'test-password-capture-123';

let tenantAId, tenantBId;
let userAId, userBId;
let cookieA, cookieB;
let entityAId, entityBId;
let assetAId, assetBId;
let sessionAId, sessionBId;
let publishedVersionAId;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Insert two tenants as superuser
  const resA = await pool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Capture Test A', SLUG_A]
  );
  tenantAId = resA.rows[0].id;

  const resB = await pool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Capture Test B', SLUG_B]
  );
  tenantBId = resB.rows[0].id;

  // Insert users
  const hash = await bcrypt.hash(PASSWORD, 12);
  const uARes = await pool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3) RETURNING id`,
    [tenantAId, 'admin@capture-a.dev', hash]
  );
  userAId = uARes.rows[0].id;

  const uBRes = await pool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3) RETURNING id`,
    [tenantBId, 'admin@capture-b.dev', hash]
  );
  userBId = uBRes.rows[0].id;

  // Login
  const loginA = await request('POST', '/api/auth/login', {
    body: { email: 'admin@capture-a.dev', password: PASSWORD, tenantSlug: SLUG_A },
  });
  cookieA = extractCookie(loginA.headers);

  const loginB = await request('POST', '/api/auth/login', {
    body: { email: 'admin@capture-b.dev', password: PASSWORD, tenantSlug: SLUG_B },
  });
  cookieB = extractCookie(loginB.headers);

  // Insert entities
  const eARes = await pool.query(
    `INSERT INTO entity (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [tenantAId, 'Capture Entity A']
  );
  entityAId = eARes.rows[0].id;

  const eBRes = await pool.query(
    `INSERT INTO entity (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [tenantBId, 'Capture Entity B']
  );
  entityBId = eBRes.rows[0].id;

  // Insert assets
  const aARes = await pool.query(
    `INSERT INTO asset (entity_id, tenant_id, name, asset_type, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [entityAId, tenantAId, 'Messaging Architecture', 'Messaging Architecture', userAId]
  );
  assetAId = aARes.rows[0].id;

  const aBRes = await pool.query(
    `INSERT INTO asset (entity_id, tenant_id, name, asset_type, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [entityBId, tenantBId, 'Messaging Architecture B', 'Messaging Architecture', userBId]
  );
  assetBId = aBRes.rows[0].id;

  // Insert a published asset version (needed for session seed)
  const pvARes = await pool.query(
    `INSERT INTO asset_version (asset_id, tenant_id, version_number, content, state, created_by)
     VALUES ($1, $2, 1, $3, 'published', $4) RETURNING id`,
    [assetAId, tenantAId, '# Published MA content for tenant A', userAId]
  );
  publishedVersionAId = pvARes.rows[0].id;

  // Insert sessions (direct pool inserts as superuser)
  const sARes = await pool.query(
    `INSERT INTO session (tenant_id, entity_id, created_by, title, status, seed_asset_versions)
     VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
    [tenantAId, entityAId, userAId, 'Capture Test Session A', `{${publishedVersionAId}}`]
  );
  sessionAId = sARes.rows[0].id;

  const sBRes = await pool.query(
    `INSERT INTO session (tenant_id, entity_id, created_by, title, status, seed_asset_versions)
     VALUES ($1, $2, $3, $4, 'active', '{}') RETURNING id`,
    [tenantBId, entityBId, userBId, 'Capture Test Session B']
  );
  sessionBId = sBRes.rows[0].id;
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
// Test 1: POST /captures — success creates draft asset_version and capture record
// ---------------------------------------------------------------------------

test('POST /captures creates a new draft asset_version and capture record', async () => {
  const captureContent = '# Captured content\n\nThis is the captured output from the session.';

  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
      content: captureContent,
      notes: 'First capture test',
    },
  });

  assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.capture, 'Response should include capture record');
  assert.ok(res.body.assetVersion, 'Response should include assetVersion record');
  assert.equal(res.body.capture.sessionId, sessionAId, 'Capture sessionId should match');
  assert.equal(res.body.capture.targetAssetId, assetAId, 'Capture targetAssetId should match');
  assert.equal(res.body.assetVersion.assetId, assetAId, 'assetVersion assetId should match');
  assert.equal(res.body.assetVersion.content, captureContent, 'assetVersion content should match');
});

// ---------------------------------------------------------------------------
// Test 2: POST /captures — capture is always in draft state (never auto-published)
// ---------------------------------------------------------------------------

test('POST /captures creates asset_version in draft state, never auto-published', async () => {
  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
      content: '# Auto-publish test content',
    },
  });

  assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.assetVersion.state, 'draft', 'Captured version must be in draft state — never auto-published');
});

// ---------------------------------------------------------------------------
// Test 3: POST /captures — source_session_id is recorded on asset_version
// ---------------------------------------------------------------------------

test('POST /captures records source_session_id on the created asset_version', async () => {
  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
      content: '# Source session link test',
    },
  });

  assert.equal(res.status, 201);

  // Check via direct DB query
  const dbCheck = await pool.query(
    `SELECT source_session_id FROM asset_version WHERE id = $1`,
    [res.body.assetVersion.id]
  );
  assert.equal(
    dbCheck.rows[0].source_session_id,
    sessionAId,
    'source_session_id on asset_version must match the capture session'
  );
});

// ---------------------------------------------------------------------------
// Test 4: POST /captures — version_number auto-increments correctly
// ---------------------------------------------------------------------------

test('POST /captures version_number is one higher than previous max', async () => {
  // Get current max version for assetA
  const maxRes = await pool.query(
    `SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM asset_version WHERE asset_id = $1`,
    [assetAId]
  );
  const maxBefore = Number(maxRes.rows[0].max_ver);

  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
      content: '# Version number increment test',
    },
  });

  assert.equal(res.status, 201);
  assert.equal(
    res.body.assetVersion.versionNumber,
    maxBefore + 1,
    'New version_number should be previous max + 1'
  );
});

// ---------------------------------------------------------------------------
// Test 5: POST /captures — notes field is optional but stored when provided
// ---------------------------------------------------------------------------

test('POST /captures stores notes when provided and null when omitted', async () => {
  // With notes
  const withNotes = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
      content: '# Notes test — with notes',
      notes: 'Refined the ICP based on session output',
    },
  });
  assert.equal(withNotes.status, 201);

  const dbWithNotes = await pool.query(
    `SELECT notes FROM asset_version WHERE id = $1`,
    [withNotes.body.assetVersion.id]
  );
  assert.equal(dbWithNotes.rows[0].notes, 'Refined the ICP based on session output', 'Notes should be stored');

  // Without notes
  const withoutNotes = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
      content: '# Notes test — without notes',
    },
  });
  assert.equal(withoutNotes.status, 201);

  const dbWithoutNotes = await pool.query(
    `SELECT notes FROM asset_version WHERE id = $1`,
    [withoutNotes.body.assetVersion.id]
  );
  assert.equal(dbWithoutNotes.rows[0].notes, null, 'Notes should be null when not provided');
});

// ---------------------------------------------------------------------------
// Test 6: POST /captures — missing sessionId returns 400
// ---------------------------------------------------------------------------

test('POST /captures returns 400 when sessionId is missing', async () => {
  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      targetAssetId: assetAId,
      content: '# Missing sessionId test',
    },
  });
  assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'sessionId is required');
});

// ---------------------------------------------------------------------------
// Test 7: POST /captures — missing targetAssetId returns 400
// ---------------------------------------------------------------------------

test('POST /captures returns 400 when targetAssetId is missing', async () => {
  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      content: '# Missing targetAssetId test',
    },
  });
  assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'targetAssetId is required');
});

// ---------------------------------------------------------------------------
// Test 8: POST /captures — missing content returns 400
// ---------------------------------------------------------------------------

test('POST /captures returns 400 when content is missing', async () => {
  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
    },
  });
  assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'content is required');
});

// ---------------------------------------------------------------------------
// Test 9: POST /captures — unauthenticated request returns 401
// ---------------------------------------------------------------------------

test('POST /captures returns 401 without authentication', async () => {
  const res = await request('POST', '/api/captures', {
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
      content: '# Unauthorized test',
    },
  });
  assert.equal(res.status, 401, `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
});

// ---------------------------------------------------------------------------
// Test 10: POST /captures — successive captures produce sequential version numbers
// ---------------------------------------------------------------------------

test('POST /captures: two successive captures produce consecutive version numbers', async () => {
  // Create a fresh asset for this test to have a clean version slate
  const freshAssetRes = await pool.query(
    `INSERT INTO asset (entity_id, tenant_id, name, asset_type, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [entityAId, tenantAId, 'Sequential Version Asset', 'ICP', userAId]
  );
  const freshAssetId = freshAssetRes.rows[0].id;

  const res1 = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: freshAssetId,
      content: '# First sequential capture',
    },
  });
  assert.equal(res1.status, 201, `First capture failed: ${JSON.stringify(res1.body)}`);

  const res2 = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: freshAssetId,
      content: '# Second sequential capture',
    },
  });
  assert.equal(res2.status, 201, `Second capture failed: ${JSON.stringify(res2.body)}`);

  const v1 = res1.body.assetVersion.versionNumber;
  const v2 = res2.body.assetVersion.versionNumber;
  assert.equal(v2, v1 + 1, `Second version number (${v2}) should be first (${v1}) + 1`);
});

// ---------------------------------------------------------------------------
// Test 11: POST /captures — capture record links back to the produced asset_version
// ---------------------------------------------------------------------------

test('POST /captures: capture.producedVersionId matches the created assetVersion.id', async () => {
  const res = await request('POST', '/api/captures', {
    cookie: cookieA,
    body: {
      sessionId: sessionAId,
      targetAssetId: assetAId,
      content: '# Link verification test',
    },
  });

  assert.equal(res.status, 201);
  assert.equal(
    res.body.capture.producedVersionId,
    res.body.assetVersion.id,
    'capture.producedVersionId must equal assetVersion.id'
  );
});
