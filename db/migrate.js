/**
 * Migration runner — executes SQL migration files in order against the
 * configured Postgres database.
 *
 * Usage: node db/migrate.js
 */

import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Track applied migrations in a dedicated table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query(
      'SELECT filename FROM _migrations ORDER BY id'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log('[migrate] No pending migrations.');
      return;
    }

    for (const filename of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');
      console.log(`[migrate] Applying ${filename}…`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`[migrate] Applied ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw Object.assign(err, { migration: filename });
      }
    }

    console.log('[migrate] All migrations applied.');
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate] Failed:', err.message);
  if (err.migration) console.error('[migrate] In migration:', err.migration);
  process.exit(1);
});
