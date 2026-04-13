# Mnemos Database Schema Reference

> Auto-generated — do not edit manually. Last updated: 2026-04-13T07:18:28.455Z.

## Enums

### `user_role`

| Value |
|-------|
| `admin` |
| `editor` |
| `viewer` |

### `asset_state`

| Value |
|-------|
| `draft` |
| `published` |
| `archived` |

### `session_status`

| Value |
|-------|
| `active` |
| `closed` |

### `message_role`

| Value |
|-------|
| `user` |
| `assistant` |

## Tables

### `tenant` (`tenant`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `name` | `text('name').notNull()` |
| `slug` | `text('slug').notNull().unique()` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |
| `settings` | `jsonb('settings').notNull().default({})` |

### `user` (`user`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `email` | `text('email').notNull()` |
| `passwordHash` | `text('password_hash')` |
| `role` | `userRoleEnum('role').notNull().default('editor')` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |

### `entity` (`entity`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `name` | `text('name').notNull()` |
| `description` | `text('description')` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |

### `asset` (`asset`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `entityId` | `uuid('entity_id').notNull().references(() => entity.id, { onDelete: 'cascade' })` |
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `name` | `text('name').notNull()` |
| `assetType` | `text('asset_type').notNull()` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |
| `createdBy` | `uuid('created_by').notNull().references(() => user.id)` |

### `session` (`session`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `entityId` | `uuid('entity_id').notNull().references(() => entity.id, { onDelete: 'cascade' })` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |
| `createdBy` | `uuid('created_by').notNull().references(() => user.id)` |
| `title` | `text('title')` |
| `status` | `sessionStatusEnum('status').notNull().default('active')` |
| `seedAssetVersions` | `text('seed_asset_versions').array().notNull().default([])` |
| `excludedAssetVersions` | `text('excluded_asset_versions').array().notNull().default(sql`'{}'`)` |
| `contextTokenCount` | `integer('context_token_count')` |

### `asset_version` (`assetVersion`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `assetId` | `uuid('asset_id').notNull().references(() => asset.id, { onDelete: 'cascade' })` |
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `versionNumber` | `integer('version_number').notNull()` |
| `content` | `text('content').notNull()` |
| `state` | `assetStateEnum('state').notNull().default('draft')` |
| `publishedAt` | `timestamp('published_at', { withTimezone: true })` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |
| `createdBy` | `uuid('created_by').notNull().references(() => user.id)` |
| `sourceSessionId` | `uuid('source_session_id').references(() => session.id)` |
| `notes` | `text('notes')` |

### `session_message` (`sessionMessage`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `sessionId` | `uuid('session_id').notNull().references(() => session.id, { onDelete: 'cascade' })` |
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `role` | `messageRoleEnum('role').notNull()` |
| `content` | `text('content').notNull()` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |

### `onboarding_state` (`onboardingState`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `entityId` | `uuid('entity_id').references(() => entity.id, { onDelete: 'set null' })` |
| `state` | `jsonb('state').notNull().default({})` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |
| `updatedAt` | `timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()` |
| `version` | `integer('version').notNull().default(1)` |

### `idempotency_record` (`idempotencyRecord`)

| Column | Definition |
|--------|------------|
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `idempotencyKey` | `text('idempotency_key').notNull()` |
| `requestPath` | `text('request_path').notNull()` |
| `status` | `text('status').notNull().default('processing')` |
| `responseStatus` | `integer('response_status')` |
| `responseBody` | `jsonb('response_body')` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |
| `expiresAt` | `timestamp('expires_at', { withTimezone: true }).notNull()` |

### `capture` (`capture`)

| Column | Definition |
|--------|------------|
| `id` | `uuid('id').primaryKey().defaultRandom()` |
| `sessionId` | `uuid('session_id').notNull().references(() => session.id, { onDelete: 'cascade' })` |
| `tenantId` | `uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' })` |
| `targetAssetId` | `uuid('target_asset_id').notNull().references(() => asset.id)` |
| `producedVersionId` | `uuid('produced_version_id').notNull().references(() => assetVersion.id)` |
| `createdAt` | `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` |
| `createdBy` | `uuid('created_by').notNull().references(() => user.id)` |
