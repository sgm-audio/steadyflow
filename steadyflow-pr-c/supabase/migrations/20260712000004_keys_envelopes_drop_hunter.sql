-- Drop 'hunter' as a BYOK provider. It's a contact/email-finder tool with
-- no use case for a solo POD art store -- irrelevant scope carried over
-- from the generic multi-tenant SaaS design. proxy-hunter, proxyHunter,
-- and every provider enum referencing it have been removed from the code
-- in the same change; this just brings the schema in line.

alter table public.keys_envelopes drop constraint keys_envelopes_provider_check;

alter table public.keys_envelopes add constraint keys_envelopes_provider_check
  check (provider in
    ('firecrawl','tavily','deepseek','nvidia-nim','groq','openai-compatible','shopify-admin','printify'));
