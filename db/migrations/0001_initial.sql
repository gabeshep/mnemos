-- Mnemos v1 — Initial Schema Migration
-- Creates all tables, relationships, indexes, and RLS policies.
--
-- Tenant isolation strategy: Row-Level Security (RLS) via Postgres.
-- The application sets the session-local parameter `app.current_tenant_id`
-- at the start of every request. All RLS policies filter against this value.
-- No operational query executes without a tenant_id filter.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE asset_state AS ENUM ('draft', 'published', 'archived');
CREATE TYPE session_status AS ENUM ('active', 'closed');
CREATE TYPE message_role AS ENUM ('user', 'assistant');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE tenant (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  settings    JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE "user" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'editor',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE entity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE asset (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  asset_type  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID NOT NULL REFERENCES "user"(id)
);

CREATE TABLE session (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  entity_id           UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL REFERENCES "user"(id),
  title               TEXT,
  status              session_status NOT NULL DEFAULT 'active',
  seed_asset_versions UUID[] NOT NULL DEFAULT '{}'
);

-- asset_version references session, session references asset_version IDs (seed list).
-- We declare asset_version after session to satisfy the FK to session,
-- and use a deferred FK approach for session.seed_asset_versions (array — no FK constraint,
-- enforced at application layer per spec).

CREATE TABLE asset_version (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  content           TEXT NOT NULL,
  state             asset_state NOT NULL DEFAULT 'draft',
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID NOT NULL REFERENCES "user"(id),
  source_session_id UUID REFERENCES session(id),
  notes             TEXT,
  UNIQUE (asset_id, version_number)
);

CREATE TABLE session_message (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  role        message_role NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE capture (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  target_asset_id     UUID NOT NULL REFERENCES asset(id),
  produced_version_id UUID NOT NULL REFERENCES asset_version(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID NOT NULL REFERENCES "user"(id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Tenant lookups (most frequent filter)
CREATE INDEX idx_user_tenant           ON "user"(tenant_id);
CREATE INDEX idx_entity_tenant         ON entity(tenant_id);
CREATE INDEX idx_asset_tenant          ON asset(tenant_id);
CREATE INDEX idx_asset_entity          ON asset(entity_id);
CREATE INDEX idx_asset_version_tenant  ON asset_version(tenant_id);
CREATE INDEX idx_asset_version_asset   ON asset_version(asset_id);
CREATE INDEX idx_asset_version_state   ON asset_version(asset_id, state);
CREATE INDEX idx_session_tenant        ON session(tenant_id);
CREATE INDEX idx_session_entity        ON session(entity_id);
CREATE INDEX idx_session_message_session ON session_message(session_id);
CREATE INDEX idx_session_message_tenant  ON session_message(tenant_id);
CREATE INDEX idx_capture_tenant        ON capture(tenant_id);
CREATE INDEX idx_capture_session       ON capture(session_id);
CREATE INDEX idx_capture_asset         ON capture(target_asset_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
-- The application sets current_setting('app.current_tenant_id') at the start
-- of every request via SET LOCAL. This is the single enforcement point for
-- tenant isolation at the database layer.
--
-- tenant table intentionally has NO RLS — it is accessed only by admin
-- operations that run outside the per-request tenant context.

ALTER TABLE "user"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity           ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset            ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_version    ENABLE ROW LEVEL SECURITY;
ALTER TABLE session          ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_message  ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture          ENABLE ROW LEVEL SECURITY;

-- Helper: returns the current request's tenant_id as UUID, or NULL if unset.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID
  LANGUAGE sql STABLE
  AS $$
    SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid
  $$;

-- RLS policies — one permissive policy per table, all operations.
-- USING clause enforces isolation on SELECT/UPDATE/DELETE.
-- WITH CHECK clause enforces isolation on INSERT/UPDATE.

CREATE POLICY tenant_isolation ON "user"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON entity
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON asset
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON asset_version
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON session
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON session_message
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON capture
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
