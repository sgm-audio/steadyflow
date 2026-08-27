-- SteadyFlow server-side DEK wrap/unwrap
-- Migration: 0006_dek_pgsodium_wrap
--
-- Client wraps the raw provider key with a random DEK (AES-256-GCM), then
-- wraps that DEK with a passphrase-derived key (Argon2id) before it ever
-- leaves the browser -- see @steadyflow/crypto. wrap_dek() adds one more
-- layer on top of that client-wrapped blob, using the server's pgsodium
-- KEK, before it's persisted to keys_envelopes.dek_wrapped. unwrap_dek()
-- reverses it -- for future use once proxyFirecrawl/proxyLlm actually
-- unwrap and call real provider APIs (currently MVP placeholders, see
-- apps/edge/src/workers.ts).
--
-- Requires the one-time, non-idempotent KEK setup in
-- supabase/scripts/setup-kek.sql to have been run first (creates a
-- pgsodium key named 'steadyflow-kek', and grants the function owner
-- membership in pgsodium_keyholder -- that grant needs superuser/
-- supabase_admin and can't run inside a normal migration, which is
-- executed as plain `postgres` locally). That's deliberately not a
-- migration -- re-running pgsodium.create_key() on every `supabase db
-- reset` would mint a new key and orphan every previously-wrapped DEK.
-- Until it's run, wrap_dek()/unwrap_dek() raise a clear error instead of
-- silently doing nothing.

create or replace function public.wrap_dek(p_dek bytea)
returns bytea
language plpgsql
security definer
set search_path = pgsodium, public
as $$
declare
  v_kek_id uuid;
  v_nonce bytea;
begin
  select id into v_kek_id from pgsodium.key where name = 'steadyflow-kek' and status = 'valid' limit 1;
  if v_kek_id is null then
    raise exception 'KEK "steadyflow-kek" not found -- run supabase/scripts/setup-kek.sql first';
  end if;
  v_nonce := pgsodium.crypto_aead_ietf_noncegen();
  -- Nonce is prepended to the ciphertext so unwrap_dek doesn't need it passed separately.
  return v_nonce || pgsodium.crypto_aead_ietf_encrypt(p_dek, ''::bytea, v_nonce, v_kek_id);
end;
$$;

create or replace function public.unwrap_dek(p_wrapped bytea)
returns bytea
language plpgsql
security definer
set search_path = pgsodium, public
as $$
declare
  v_kek_id uuid;
  v_nonce bytea;
  v_ciphertext bytea;
begin
  select id into v_kek_id from pgsodium.key where name = 'steadyflow-kek' and status = 'valid' limit 1;
  if v_kek_id is null then
    raise exception 'KEK "steadyflow-kek" not found -- run supabase/scripts/setup-kek.sql first';
  end if;
  v_nonce := substring(p_wrapped from 1 for 12);
  v_ciphertext := substring(p_wrapped from 13);
  return pgsodium.crypto_aead_ietf_decrypt(v_ciphertext, ''::bytea, v_nonce, v_kek_id);
end;
$$;

revoke all on function public.wrap_dek(bytea) from public;
revoke all on function public.unwrap_dek(bytea) from public;
-- authenticated: the web app calls these directly from a user's own
-- session (see apps/web/src/app/api/keys/route.ts), same pattern as
-- direct authenticated writes to intents/audit_log elsewhere in the app.
-- service_role: for the apps/edge keys-set/keys-test handlers.
grant execute on function public.wrap_dek(bytea) to authenticated, service_role;
grant execute on function public.unwrap_dek(bytea) to authenticated, service_role;
