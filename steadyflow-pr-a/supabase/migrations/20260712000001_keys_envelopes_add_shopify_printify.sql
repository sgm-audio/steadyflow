-- Add 'shopify-admin' and 'printify' as valid BYOK providers.
--
-- These store a single opaque secret (Shopify custom-app Admin API access
-- token; Printify personal access token) each -- the existing single-layer
-- wrap_dek()/unwrap_dek() model (see 20260710000001_keys_envelopes_drop_
-- passphrase_layer.sql) already fits, no new table needed.

alter table public.keys_envelopes drop constraint keys_envelopes_provider_check;

alter table public.keys_envelopes add constraint keys_envelopes_provider_check
  check (provider in
    ('firecrawl','hunter','tavily','deepseek','nvidia-nim','groq','openai-compatible','shopify-admin','printify'));
