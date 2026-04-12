/**
 * Database connection — node-postgres pool.
 *
 * NOTE: The `db` (Drizzle) instance is intentionally absent here.
 * A per-request Drizzle instance is created inside `withTenant()` in
 * lib/tenant-context.js, where it is bound to the tenant-scoped connection.
 * All application queries MUST flow through `withTenant()` to ensure
 * Row-Level Security is enforced correctly.
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err);
});

export { pool };
