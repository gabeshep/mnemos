/**
 * Tenant context — the single, consistent mechanism for scoping all
 * database operations to a tenant.
 *
 * HOW IT WORKS
 * ────────────
 * Postgres RLS policies on all operational tables filter rows using the
 * `current_tenant_id()` database function, which reads the session-local
 * parameter `app.current_tenant_id`.
 *
 * Before any query runs, the application must call `withTenant(tenantId, fn)`
 * which:
 *   1. Acquires a dedicated connection from the pool.
 *   2. Issues SET LOCAL app.current_tenant_id = '<id>' on that connection,
 *      scoping the parameter to the current transaction.
 *   3. Executes the caller's work inside a transaction.
 *   4. Releases the connection.
 *
 * All query logic MUST flow through `withTenant`. Ad-hoc queries that bypass
 * this mechanism will be blocked by RLS (they'll see an empty tenant_id and
 * match no rows) — but correctness depends on never bypassing it.
 *
 * SUPERUSER / MIGRATION EXCEPTION
 * ────────────────────────────────
 * Migration scripts and admin operations run as the superuser role, which
 * bypasses RLS by default. That is intentional: migrations operate outside
 * the per-request tenant context. All application-path code uses a
 * lower-privilege role with RLS enforced.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { pool } from '../db/index.js';

const tenantStore = new AsyncLocalStorage();

/**
 * Executes `fn(client, tdb)` inside a transaction scoped to `tenantId`.
 *
 * `fn` receives a raw pg Client and a Drizzle instance bound to that client.
 * All queries within the transaction should use `client` or `tdb`.
 * The RLS parameter is set before `fn` runs.
 *
 * @param {string} tenantId - UUID of the tenant for this operation
 * @param {(client: import('pg').PoolClient, tdb: import('drizzle-orm/node-postgres').NodePgDatabase) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTenant(tenantId, fn) {
  if (!tenantId) throw new Error('withTenant: tenantId is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Scope the tenant to this transaction only (SET LOCAL, not SET SESSION)
    await client.query(
      'SELECT set_config($1, $2, true)',  // true = transaction-local
      ['app.current_tenant_id', tenantId]
    );

    const tdb = drizzle(client, { schema });
    const result = await fn(client, tdb);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Express middleware that resolves the tenant from the request and attaches
 * it to `req.tenantId`. Replace the stub resolver with real auth/session
 * logic once authentication is wired up.
 *
 * Requests without a resolvable tenant receive a 401.
 */
export function tenantMiddleware(resolveTenantId) {
  return async (req, res, next) => {
    try {
      const tenantId = await resolveTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant could not be resolved.' });
      }
      req.tenantId = tenantId;
      tenantStore.run({ tenantId }, next);  // propagate via ALS for the entire request chain
    } catch (err) {
      next(err);
    }
  };
}

export function getCurrentTenantId() {
  return tenantStore.getStore()?.tenantId ?? null;
}

export async function withCurrentTenant(fn) {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    console.warn('[tenant-context] withCurrentTenant called with no active tenant context');
    throw new Error('No tenant context active');
  }
  return withTenant(tenantId, fn);
}
