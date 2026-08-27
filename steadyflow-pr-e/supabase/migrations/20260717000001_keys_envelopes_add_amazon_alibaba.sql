-- Add Amazon SP-API and Alibaba as valid BYOK providers for multi-platform commerce.
-- Live adapters live in @steadyflow/commerce (Amazon/Alibaba currently stubs).

alter table public.keys_envelopes drop constraint keys_envelopes_provider_check;

alter table public.keys_envelopes add constraint keys_envelopes_provider_check
  check (provider in
    ('firecrawl','tavily','deepseek','nvidia-nim','groq','openai-compatible',
     'shopify-admin','printify','amazon-sp-api','alibaba'));
