-- Mnemos — Migration 0002: Force RLS on all tenant-scoped tables
-- Without FORCE ROW LEVEL SECURITY, the table owner (the application DB user) bypasses
-- all RLS policies. This migration closes that gap.
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;
ALTER TABLE entity FORCE ROW LEVEL SECURITY;
ALTER TABLE asset FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_version FORCE ROW LEVEL SECURITY;
ALTER TABLE session FORCE ROW LEVEL SECURITY;
ALTER TABLE session_message FORCE ROW LEVEL SECURITY;
ALTER TABLE capture FORCE ROW LEVEL SECURITY;
