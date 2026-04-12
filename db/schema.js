/**
 * Mnemos — Drizzle ORM schema
 *
 * Mirrors the data model defined in the product spec exactly.
 * All operational tables carry tenant_id for RLS enforcement.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  unique,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'viewer']);
export const assetStateEnum = pgEnum('asset_state', ['draft', 'published', 'archived']);
export const sessionStatusEnum = pgEnum('session_status', ['active', 'closed']);
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant']);

// ---------------------------------------------------------------------------
// tenant — no tenant_id (root table); RLS intentionally not applied
// ---------------------------------------------------------------------------

export const tenant = pgTable('tenant', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull(),
  slug:      text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settings:  jsonb('settings').notNull().default({}),
});

// ---------------------------------------------------------------------------
// user
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  email:        text('email').notNull(),
  passwordHash: text('password_hash'),
  role:      userRoleEnum('role').notNull().default('editor'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqTenantEmail: unique().on(t.tenantId, t.email),
}));

// ---------------------------------------------------------------------------
// entity
// ---------------------------------------------------------------------------

export const entity = pgTable('entity', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  description: text('description'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// asset
// ---------------------------------------------------------------------------

export const asset = pgTable('asset', {
  id:        uuid('id').primaryKey().defaultRandom(),
  entityId:  uuid('entity_id').notNull().references(() => entity.id, { onDelete: 'cascade' }),
  tenantId:  uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  assetType: text('asset_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').notNull().references(() => user.id),
});

// ---------------------------------------------------------------------------
// session — seed_asset_versions is an array of asset_version UUIDs.
// Stored as uuid[] in Postgres; referential integrity enforced at app layer.
// ---------------------------------------------------------------------------

export const session = pgTable('session', {
  id:                uuid('id').primaryKey().defaultRandom(),
  tenantId:          uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  entityId:          uuid('entity_id').notNull().references(() => entity.id, { onDelete: 'cascade' }),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:         uuid('created_by').notNull().references(() => user.id),
  title:             text('title'),
  status:            sessionStatusEnum('status').notNull().default('active'),
  // Stored natively; Drizzle uses text array as a proxy — raw SQL migration uses uuid[].
  seedAssetVersions: text('seed_asset_versions').array().notNull().default([]),
});

// ---------------------------------------------------------------------------
// asset_version
// ---------------------------------------------------------------------------

export const assetVersion = pgTable('asset_version', {
  id:              uuid('id').primaryKey().defaultRandom(),
  assetId:         uuid('asset_id').notNull().references(() => asset.id, { onDelete: 'cascade' }),
  tenantId:        uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  versionNumber:   integer('version_number').notNull(),
  content:         text('content').notNull(),
  state:           assetStateEnum('state').notNull().default('draft'),
  publishedAt:     timestamp('published_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:       uuid('created_by').notNull().references(() => user.id),
  sourceSessionId: uuid('source_session_id').references(() => session.id),
  notes:           text('notes'),
}, (t) => ({
  uniqAssetVersion: unique().on(t.assetId, t.versionNumber),
}));

// ---------------------------------------------------------------------------
// session_message
// ---------------------------------------------------------------------------

export const sessionMessage = pgTable('session_message', {
  id:        uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  tenantId:  uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  role:      messageRoleEnum('role').notNull(),
  content:   text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------

export const capture = pgTable('capture', {
  id:                uuid('id').primaryKey().defaultRandom(),
  sessionId:         uuid('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  tenantId:          uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  targetAssetId:     uuid('target_asset_id').notNull().references(() => asset.id),
  producedVersionId: uuid('produced_version_id').notNull().references(() => assetVersion.id),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:         uuid('created_by').notNull().references(() => user.id),
});
