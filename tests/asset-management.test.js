/**
 * Integration tests — asset management
 *
 * Covers:
 *   1. POST /api/assets — create asset with valid body → 201
 *   2. POST /api/assets — missing name → 400
 *   3. POST /api/assets — bad entityId → 404
 *   4. GET /api/assets/:assetId — found → 200
 *   5. GET /api/assets/:assetId — not found → 404
 *   6. GET /api/assets/:assetId/all-versions — returns all states
 *   7. POST /api/assets/:assetId/versions — creates new draft, increments version number
 *   8. POST /api/assets/:assetId/versions/:versionId/publish — draft → published
 *   9. POST /api/assets/:assetId/versions/:versionId/publish — 409 on already-published
 *  10. POST /api/assets/:assetId/versions/:versionId/publish — archives previous published
 *  11. POST /api/assets/:assetId/versions/:versionId/demote — published → draft
 *  12. POST /api/assets/:assetId/versions/:versionId/demote — 409 on non-published
 *
 * Requires DATABASE_URL and JWT_SECRET to be set.
 * Run with: node --test tests/asset-management.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

if (!process.env.DATABASE_URL) {
  console.warn('[asset-management.test] DATABASE_URL not set — skipping all tests.');
  process.exit(0);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[asset-management.test] JWT_SECRET not set or too short — skipping all tests.');
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

const SLUG = 'asset-mgmt-test-' + Date.now();
const PASSWORD = 'test-password-asset-mgmt-123';

let tenantId;
let userId;
let cookie;
let entityId;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Insert tenant
  const tenantRes = await pool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Asset Mgmt Test Tenant', SLUG]
  );
  tenantId = tenantRes.rows[0].id;

  // Insert user
  const hash = await bcrypt.hash(PASSWORD, 12);
  const userRes = await pool.query(
    `INSERT INTO "user" (tenant_id, email, role, password_hash) VALUES ($1, $2, 'admin', $3) RETURNING id`,
    [tenantId, 'admin@asset-mgmt.dev', hash]
  );
  userId = userRes.rows[0].id;

  // Log in
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: 'admin@asset-mgmt.dev', password: PASSWORD, tenantSlug: SLUG },
  });
  cookie = extractCookie(loginRes.headers);

  // Insert entity
  const entityRes = await pool.query(
    `INSERT INTO entity (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
    [tenantId, 'Asset Mgmt Test Entity', 'Test entity for asset management']
  );
  entityId = entityRes.rows[0].id;
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

after(async () => {
  await pool.query(`DELETE FROM tenant WHERE slug = $1`, [SLUG]);
  await pool.end();
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Helper: insert an asset directly
// ---------------------------------------------------------------------------

async function insertAsset(name = 'Test Asset', assetType = 'ICP') {
  const res = await pool.query(
    `INSERT INTO asset (entity_id, tenant_id, name, asset_type, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [entityId, tenantId, name, assetType, userId]
  );
  return res.rows[0].id;
}

// ---------------------------------------------------------------------------
// Helper: insert an asset_version directly
// ---------------------------------------------------------------------------

async function insertVersion(assetId, state, versionNumber, content = 'Test content') {
  const res = await pool.query(
    `INSERT INTO asset_version (asset_id, tenant_id, version_number, content, state, created_by)
     VALUES ($1, $2, $3, $4, $5::asset_state, $6) RETURNING id`,
    [assetId, tenantId, versionNumber, content, state, userId]
  );
  return res.rows[0].id;
}

// ---------------------------------------------------------------------------
// Test 1: POST /api/assets — create with valid body → 201
// ---------------------------------------------------------------------------

test('POST /api/assets — creates asset with valid body', async () => {
  const res = await request('POST', '/api/assets', {
    cookie,
    body: { entityId, name: 'My ICP Asset', assetType: 'ICP', description: 'Initial ICP doc' },
  });

  assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.asset, 'Response should have asset');
  assert.ok(res.body.assetVersion, 'Response should have assetVersion');
  assert.equal(res.body.asset.name, 'My ICP Asset');
  assert.equal(res.body.asset.assetType, 'ICP');
  assert.equal(res.body.assetVersion.versionNumber, 1);
  assert.equal(res.body.assetVersion.state, 'draft');
});

// ---------------------------------------------------------------------------
// Test 2: POST /api/assets — missing name → 400
// ---------------------------------------------------------------------------

test('POST /api/assets — missing name returns 400', async () => {
  const res = await request('POST', '/api/assets', {
    cookie,
    body: { entityId, assetType: 'ICP' },
  });

  assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.error, 'Response should have error message');
});

// ---------------------------------------------------------------------------
// Test 3: POST /api/assets — bad entityId → 404
// ---------------------------------------------------------------------------

test('POST /api/assets — non-existent entityId returns 404', async () => {
  const res = await request('POST', '/api/assets', {
    cookie,
    body: { entityId: '00000000-0000-0000-0000-000000000000', name: 'Asset', assetType: 'ICP' },
  });

  assert.equal(res.status, 404, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
});

// ---------------------------------------------------------------------------
// Test 4: GET /api/assets/:assetId — found → 200
// ---------------------------------------------------------------------------

test('GET /api/assets/:assetId — returns asset when found', async () => {
  const assetId = await insertAsset('Get Test Asset');

  const res = await request('GET', `/api/assets/${assetId}`, { cookie });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.id, assetId);
  assert.equal(res.body.name, 'Get Test Asset');
});

// ---------------------------------------------------------------------------
// Test 5: GET /api/assets/:assetId — not found → 404
// ---------------------------------------------------------------------------

test('GET /api/assets/:assetId — returns 404 when not found', async () => {
  const res = await request('GET', '/api/assets/00000000-0000-0000-0000-000000000000', { cookie });

  assert.equal(res.status, 404, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
});

// ---------------------------------------------------------------------------
// Test 6: GET /api/assets/:assetId/all-versions — returns all states
// ---------------------------------------------------------------------------

test('GET /api/assets/:assetId/all-versions — returns all version states', async () => {
  const assetId = await insertAsset('All Versions Asset');
  const draftId = await insertVersion(assetId, 'draft', 1);
  const pubId = await insertVersion(assetId, 'published', 2);
  const archId = await insertVersion(assetId, 'archived', 3);

  const res = await request('GET', `/api/assets/${assetId}/all-versions`, { cookie });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(Array.isArray(res.body), 'Response should be an array');
  assert.equal(res.body.length, 3, 'All 3 versions should be returned');

  const ids = res.body.map(v => v.id);
  assert.ok(ids.includes(draftId), 'Draft version should be included');
  assert.ok(ids.includes(pubId), 'Published version should be included');
  assert.ok(ids.includes(archId), 'Archived version should be included');

  // Verify no content field
  assert.equal(res.body[0].content, undefined, 'Content should not be included in all-versions');

  // Verify ordered by versionNumber DESC
  assert.ok(res.body[0].versionNumber >= res.body[1].versionNumber, 'Should be ordered DESC');
});

// ---------------------------------------------------------------------------
// Test 7: POST /api/assets/:assetId/versions — creates new draft, increments number
// ---------------------------------------------------------------------------

test('POST /api/assets/:assetId/versions — creates new draft and increments version number', async () => {
  const assetId = await insertAsset('Version Save Asset');
  await insertVersion(assetId, 'draft', 1, 'Version 1 content');

  const res = await request('POST', `/api/assets/${assetId}/versions`, {
    cookie,
    body: { content: 'Version 2 content', notes: 'Updated content' },
  });

  assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.versionNumber, 2, 'Version number should be incremented to 2');
  assert.equal(res.body.state, 'draft', 'New version should be draft');
  assert.equal(res.body.content, 'Version 2 content');
  assert.equal(res.body.notes, 'Updated content');
});

// ---------------------------------------------------------------------------
// Test 8: POST /api/assets/:assetId/versions/:versionId/publish — draft → published
// ---------------------------------------------------------------------------

test('POST /api/assets/:assetId/versions/:versionId/publish — transitions draft to published', async () => {
  const assetId = await insertAsset('Publish Test Asset');
  const versionId = await insertVersion(assetId, 'draft', 1, 'Draft content');

  const res = await request('POST', `/api/assets/${assetId}/versions/${versionId}/publish`, { cookie });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.published, 'Response should have published version');
  assert.equal(res.body.published.id, versionId);
  assert.equal(res.body.published.state, 'published');
  assert.ok(res.body.published.publishedAt, 'publishedAt should be set');
  assert.equal(res.body.archived, null, 'No previous published version to archive');
});

// ---------------------------------------------------------------------------
// Test 9: POST /api/assets/:assetId/versions/:versionId/publish — 409 on already-published
// ---------------------------------------------------------------------------

test('POST /api/assets/:assetId/versions/:versionId/publish — 409 when version is already published', async () => {
  const assetId = await insertAsset('Already Published Asset');
  const versionId = await insertVersion(assetId, 'published', 1, 'Published content');

  const res = await request('POST', `/api/assets/${assetId}/versions/${versionId}/publish`, { cookie });

  assert.equal(res.status, 409, `Expected 409, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'Version is not in draft state');
});

// ---------------------------------------------------------------------------
// Test 10: POST /api/assets/:assetId/versions/:versionId/publish — archives previous published
// ---------------------------------------------------------------------------

test('POST /api/assets/:assetId/versions/:versionId/publish — archives previously published version', async () => {
  const assetId = await insertAsset('Archive Previous Asset');
  const oldPubId = await insertVersion(assetId, 'published', 1, 'Old published content');
  const newDraftId = await insertVersion(assetId, 'draft', 2, 'New draft content');

  const res = await request('POST', `/api/assets/${assetId}/versions/${newDraftId}/publish`, { cookie });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.published.id, newDraftId);
  assert.equal(res.body.published.state, 'published');
  assert.ok(res.body.archived, 'Previous published version should be archived');
  assert.equal(res.body.archived.id, oldPubId);
  assert.equal(res.body.archived.state, 'archived');
});

// ---------------------------------------------------------------------------
// Test 11: POST /api/assets/:assetId/versions/:versionId/demote — published → draft
// ---------------------------------------------------------------------------

test('POST /api/assets/:assetId/versions/:versionId/demote — transitions published to draft', async () => {
  const assetId = await insertAsset('Demote Test Asset');
  const versionId = await insertVersion(assetId, 'published', 1, 'Published content');

  const res = await request('POST', `/api/assets/${assetId}/versions/${versionId}/demote`, { cookie });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.id, versionId);
  assert.equal(res.body.state, 'draft');
  assert.equal(res.body.publishedAt, null, 'publishedAt should be cleared');
});

// ---------------------------------------------------------------------------
// Test 12: POST /api/assets/:assetId/versions/:versionId/demote — 409 on non-published
// ---------------------------------------------------------------------------

test('POST /api/assets/:assetId/versions/:versionId/demote — 409 when version is not published', async () => {
  const assetId = await insertAsset('Draft Demote Asset');
  const versionId = await insertVersion(assetId, 'draft', 1, 'Draft content');

  const res = await request('POST', `/api/assets/${assetId}/versions/${versionId}/demote`, { cookie });

  assert.equal(res.status, 409, `Expected 409, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, 'Version is not published');
});
