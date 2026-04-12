/**
 * Seed script — creates the PermaShip tenant and a seed user + entity
 * for local development.
 *
 * Safe to run multiple times: skips records that already exist.
 *
 * Usage: node db/seed.js
 */

import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const TENANT_SLUG = 'permaship';

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // --- Tenant ---
    const { rows: [existingTenant] } = await client.query(
      'SELECT id FROM tenant WHERE slug = $1',
      [TENANT_SLUG]
    );

    let tenantId;
    if (existingTenant) {
      tenantId = existingTenant.id;
      console.log(`[seed] Tenant already exists: ${tenantId}`);
    } else {
      const { rows: [newTenant] } = await client.query(
        `INSERT INTO tenant (name, slug)
         VALUES ($1, $2)
         RETURNING id`,
        ['PermaShip', TENANT_SLUG]
      );
      tenantId = newTenant.id;
      console.log(`[seed] Created tenant: ${tenantId}`);
    }

    // --- Seed admin user (needed for created_by FK on other records) ---
    const SEED_EMAIL = 'seed@permaship.dev';
    const { rows: [existingUser] } = await client.query(
      'SELECT id FROM "user" WHERE tenant_id = $1 AND email = $2',
      [tenantId, SEED_EMAIL]
    );

    let userId;
    if (existingUser) {
      userId = existingUser.id;
      console.log(`[seed] User already exists: ${userId}`);
    } else {
      const { rows: [newUser] } = await client.query(
        `INSERT INTO "user" (tenant_id, email, role)
         VALUES ($1, $2, 'admin')
         RETURNING id`,
        [tenantId, SEED_EMAIL]
      );
      userId = newUser.id;
      console.log(`[seed] Created user: ${userId}`);
    }

    // --- Entity ---
    const ENTITY_NAME = 'PermaShip Marketing';
    const { rows: [existingEntity] } = await client.query(
      'SELECT id FROM entity WHERE tenant_id = $1 AND name = $2',
      [tenantId, ENTITY_NAME]
    );

    let entityId;
    if (existingEntity) {
      entityId = existingEntity.id;
      console.log(`[seed] Entity already exists: ${entityId}`);
    } else {
      const { rows: [newEntity] } = await client.query(
        `INSERT INTO entity (tenant_id, name, description)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          tenantId,
          ENTITY_NAME,
          'Core marketing entity for the PermaShip platform.',
        ]
      );
      entityId = newEntity.id;
      console.log(`[seed] Created entity: ${entityId}`);
    }

    await client.query('COMMIT');

    console.log('\n[seed] Done.');
    console.log(`  Tenant:  ${TENANT_SLUG} (${tenantId})`);
    console.log(`  Entity:  ${ENTITY_NAME} (${entityId})`);
    console.log(`  User:    ${SEED_EMAIL} (${userId})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
