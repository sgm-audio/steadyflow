-- pgsodium KEK setup for SteadyFlow.
-- Run this ONCE per Supabase project (local and production).
--
-- IMPORTANT: This is NOT a migration -- pgsodium.create_key() is not idempotent.
-- If you run this again, you'll get a DIFFERENT KEK and all existing
-- dek_wrapped values will be orphaned. Only run this on a fresh project.
--
-- Requires superuser / supabase_admin -- granting pgsodium_keyholder
-- can't be done by the plain `postgres` role that migrations run as.
--
-- Usage (local):
--   podman exec supabase_db_steadyflow psql -U supabase_admin -d postgres -f supabase/scripts/setup-kek.sql
-- Usage (hosted):
--   Run in Supabase Dashboard -> SQL Editor (runs with adequate privileges there).
--
-- Nothing else needs configuring -- wrap_dek()/unwrap_dek() (see migration
-- 20260109000006_dek_pgsodium_wrap.sql) look the key up by name at call
-- time, so there's no SUPABASE_KEK_ID or VAULT_SECRET to copy anywhere.

-- Ensure pgsodium extension is enabled (migration 20260105000001_init does this)
-- create extension if not exists "pgsodium";

-- Lets the SECURITY DEFINER wrap_dek()/unwrap_dek() functions (owned by
-- postgres) call pgsodium's AEAD functions on callers' behalf.
grant pgsodium_keyholder to postgres;

-- Create the KEK.
select id, name, key_type from pgsodium.create_key(key_type => 'aead-ietf', name => 'steadyflow-kek');
