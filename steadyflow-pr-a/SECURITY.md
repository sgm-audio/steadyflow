# Security

## Threat model

SteadyFlow handles:
- User-owned provider API keys (Firecrawl, Tavily, LLM)
- Scraped e-commerce data (Shopify)
- AI-generated insights
- Audit logs of all external actions

## Key handling

- **BYOK only.** No provider keys are ever stored in plaintext on the server.
- **Envelope encryption.** Each provider key is wrapped with a per-org DEK
  via pgsodium.
- **Server unwrap is scoped.** `pgsodium` decrypts the DEK inside a SECURITY
  DEFINER function; provider keys are zeroed after the request completes.
- **No key in logs.** Audit log stores `input_hash` (SHA-256), never the input.

SteadyFlow never stores plaintext provider keys at rest. Encrypted key envelopes
are stored in Supabase and decrypted only for authorized provider requests.

## RLS

Every table has RLS enabled. Policies are keyed to `auth.uid()` + `org_id`
via `public.is_member_of(_org_id)`. `service_role` is restricted to worker
files only (enforced by lint rule + CI check).

## Audit log

- Append-only (trigger blocks UPDATE/DELETE except by `service_role`)
- Retention: 13 months default, configurable per org
- Exposed to users via `audit.query` Edge Function

## Rate limiting

Per-user token bucket in `rate_limits` table. Enforced in
`supabase/functions/_shared/rateLimit.ts` before any provider call.

## CI Security

- **Gitleaks:** Scans every commit for secrets. Config in `.gitleaks.toml`.
- **Dependency audit:** `pnpm audit --audit-level=high` on every PR.
- **npm audit:** Vite CVE resolved (PostCSS moderate remaining, non-exploitable).
- **Service role keys:** Moved from test fixtures to vitest `env` config.

## Reporting

security@sgm-studios.com (configure before public launch)
