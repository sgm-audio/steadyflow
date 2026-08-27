-- Drop the client-side passphrase-derived encryption layer on keys_envelopes.
--
-- Previously: raw provider key -> AES-GCM with a random DEK -> DEK wrapped
-- with an Argon2id passphrase key (browser) -> that wrapped again with the
-- server's pgsodium KEK (wrap_dek). The passphrase never left the browser,
-- which meant the background worker -- which has no passphrase, and no way
-- to get one -- could never unwrap a key to call the real provider API.
-- Every analysis silently fell back to the no-key heuristic path.
--
-- This is a single-user personal deployment, not a zero-knowledge
-- multi-tenant product, so the server's own KEK (already used for
-- encryption at rest) is a reasonable trust boundary on its own.
--
-- New shape: wrapped_key = wrap_dek(raw_provider_key) directly. One layer,
-- unwrappable synchronously by anything holding a service-role/authenticated
-- Supabase client -- including the worker.
--
-- Existing rows predate this change and are not valid under the new format;
-- keys must be re-entered via the Keys page after this migration runs.

delete from public.keys_envelopes;

alter table public.keys_envelopes
  drop column iv,
  drop column dek_wrapped,
  drop column dek_salt,
  drop column kdf_params;

comment on column public.keys_envelopes.wrapped_key is
  'Provider API key, encrypted with the server KEK via wrap_dek() (pgsodium, nonce prepended). No client-side passphrase layer.';
