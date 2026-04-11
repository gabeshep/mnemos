/**
 * Database connection — Drizzle ORM over node-postgres.
 *
 * Exports a single `db` instance used throughout the application.
 * Tenant isolation is applied at the request layer via lib/tenant-context.js,
 * not here — keeping connection setup clean and single-purpose.
 */

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err);
});

export const db = drizzle(pool, { schema });
export { pool };
