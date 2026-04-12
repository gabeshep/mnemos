-- Mnemos — Migration 0005: onboarding_state table
-- Creates the onboarding_state table with RLS and a SECURITY DEFINER helper
-- function for 403 vs 404 cross-tenant distinction.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE onboarding_state (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  entity_id  UUID REFERENCES entity(id) ON DELETE SET NULL,
  state      JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_state_tenant ON onboarding_state(tenant_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_state FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON onboarding_state
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helper — returns the owning tenant_id of a record,
-- bypassing RLS. Used solely to distinguish 403 (cross-tenant probe) from
-- 404 (genuinely missing UUID) in the PUT handler.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_onboarding_state_tenant_id(p_id uuid)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  AS $$
    SELECT tenant_id FROM onboarding_state WHERE id = p_id
  $$;
