ALTER TABLE session
  ADD COLUMN IF NOT EXISTS excluded_asset_versions UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS context_token_count INTEGER;
