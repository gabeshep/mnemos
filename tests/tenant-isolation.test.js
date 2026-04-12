/**
 * Integration tests — tenant isolation via RLS
 *
 * Verifies that:
 *   1. withTenant() scopes reads to the correct tenant's rows
 *   2. withTenant() prevents cross-tenant reads (no data leakage)
 *   3. A raw pool.query() outside withTenant returns 0 rows (RLS blocks null tenant context)
 *
 * Requires DATABASE_URL to be set. If absent, all tests are skipped.
 *
 * Run with: node --test tests/tenant-isolation.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.DATABASE_URL) {
  console.warn('[tenant-isolation] DATABASE_URL not set — skipping all tests.');
  process.exit(0);
}

import { pool } from '../db/index.js';
import { withTenant, getCurrentTenantId, withCurrentTenant, tenantMiddleware } from '../lib/tenant-context.js';

// UUIDs for the two test tenants — generated fresh each run to avoid collisions
let tenantAId;
let tenantBId;

// ---------------------------------------------------------------------------
// Setup: insert test tenants + one entity each
// ---------------------------------------------------------------------------
before(async () => {
  // Insert tenant A
  const resA = await pool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Test Tenant A', 'test-tenant-a']
  );
  tenantAId = resA.rows[0].id;

  // Insert tenant B
  const resB = await pool.query(
    `INSERT INTO tenant (name, slug) VALUES ($1, $2) RETURNING id`,
    ['Test Tenant B', 'test-tenant-b']
  );
  tenantBId = resB.rows[0].id;

  // Insert one entity for each tenant using withTenant so RLS allows the write
  await withTenant(tenantAId, async (client) => {
    await client.query(
      `INSERT INTO entity (tenant_id, name, description) VALUES ($1, $2, $3)`,
      [tenantAId, 'Entity A1', 'Belongs to tenant A']
    );
  });

  await withTenant(tenantBId, async (client) => {
    await client.query(
      `INSERT INTO entity (tenant_id, name, description) VALUES ($1, $2, $3)`,
      [tenantBId, 'Entity B1', 'Belongs to tenant B']
    );
  });
});

// ---------------------------------------------------------------------------
// Teardown: delete test tenants (cascades to entity and all child tables)
// ---------------------------------------------------------------------------
after(async () => {
  await pool.query(`DELETE FROM tenant WHERE slug LIKE 'test-%'`);
  await pool.end();
});

// ---------------------------------------------------------------------------
// Test 1: withTenant scopes reads to the correct tenant
// ---------------------------------------------------------------------------
test('withTenant scopes reads to the correct tenant', async () => {
  const rows = await withTenant(tenantAId, async (client) => {
    const res = await client.query(
      `SELECT * FROM entity WHERE tenant_id = $1`,
      [tenantAId]
    );
    return res.rows;
  });

  assert.equal(rows.length, 1, 'Should return exactly 1 entity for tenant A');
  assert.equal(rows[0].name, 'Entity A1', 'Entity name should match tenant A entity');
  assert.equal(rows[0].tenant_id, tenantAId, 'tenant_id should match tenant A');
});

// ---------------------------------------------------------------------------
// Test 2: withTenant prevents cross-tenant reads
// ---------------------------------------------------------------------------
test('withTenant prevents cross-tenant reads', async () => {
  // Query from tenant B's context but ask for tenant A's id — RLS should filter
  const rows = await withTenant(tenantBId, async (client) => {
    // RLS policy filters on current_tenant_id(), so tenant A rows are invisible
    // even if we try to select them by id
    const res = await client.query(
      `SELECT * FROM entity WHERE tenant_id = $1`,
      [tenantAId]
    );
    return res.rows;
  });

  assert.equal(rows.length, 0, 'Tenant B context must not see tenant A entities (cross-tenant read blocked)');

  // Also verify tenant B can see its own entity
  const ownRows = await withTenant(tenantBId, async (client) => {
    const res = await client.query(
      `SELECT * FROM entity WHERE tenant_id = $1`,
      [tenantBId]
    );
    return res.rows;
  });

  assert.equal(ownRows.length, 1, 'Tenant B should still see its own entity');
  assert.equal(ownRows[0].name, 'Entity B1', 'Entity name should match tenant B entity');
});

// ---------------------------------------------------------------------------
// Test 3: raw pool.query() outside withTenant returns 0 rows (fail-closed)
// ---------------------------------------------------------------------------
test('raw pool query outside withTenant returns no rows (RLS blocks null tenant context)', async () => {
  // No SET LOCAL has been issued — current_tenant_id() returns NULL.
  // NULL = NULL is FALSE in SQL, so RLS blocks every row.
  const res = await pool.query(`SELECT * FROM entity WHERE tenant_id IN ($1, $2)`, [tenantAId, tenantBId]);

  assert.equal(
    res.rows.length,
    0,
    'RLS must block all entity rows when no tenant context is set (fail-closed property)'
  );
});

// ---------------------------------------------------------------------------
// Test 4: withCurrentTenant throws when no tenant context is active
// ---------------------------------------------------------------------------
test('withCurrentTenant throws when no tenant context is active', async () => {
  await assert.rejects(
    () => withCurrentTenant(async () => {}),
    (err) => err.message === 'No tenant context active'
  );
});

// ---------------------------------------------------------------------------
// Test 5: getCurrentTenantId returns correct value inside tenantMiddleware's next callback
// ---------------------------------------------------------------------------
test('getCurrentTenantId returns tenantId set by tenantMiddleware in the async chain', async () => {
  const middleware = tenantMiddleware(() => tenantAId);
  const req = {};
  const res = { status: () => ({ json: () => {} }) };
  await new Promise((resolve) => {
    middleware(req, res, () => {
      assert.equal(getCurrentTenantId(), tenantAId);
      resolve();
    });
  });
});
