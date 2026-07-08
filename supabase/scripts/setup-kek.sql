-- pgsodium KEK setup for SteadyFlow.
-- Run this ONCE per Supabase project (local and production).
-- After running, copy the returned UUID into SUPABASE_KEK_ID env var.
--
-- IMPORTANT: This is NOT a migration -- pgsodium.create_key() is not idempotent.
-- If you run this again, you'll get a DIFFERENT KEK and all existing
-- dek_wrapped values will be orphaned. Only run this on a fresh project.
--
-- Usage:
--   1. Run this in Supabase SQL editor
--   2. Copy the UUID from the result
--   3. Set SUPABASE_KEK_ID=<uuid> in Edge Function secrets + .env.local
--   4. Set VAULT_SECRET in Edge Function secrets + .env.local

-- Ensure pgsodium extension is enabled (migration 20260105000001_init does this)
-- create extension if not exists "pgsodium";

-- Create the vault secret (required before create_key)
-- Choose a strong random value for production
-- select pgsodium.set_vault_secret('your-secure-vault-secret-here');

-- Create the KEK -- returns a UUID
select pgsodium.create_key('steadyflow-kek');
