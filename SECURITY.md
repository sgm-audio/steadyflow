# Security

## Threat model

SteadyFlow handles:
- User-owned provider API keys (Firecrawl, Hunter, Tavily, LLM)
- Scraped e-commerce data (Shopify, Etsy)
- AI-generated insights
- Audit logs of all external actions

## Key handling

- **BYOK only.** No provider keys are ever stored in plaintext on the server.
- **Envelope encryption.** Each provider key is wrapped with a per-org DEK
  (Argon2id-derived from a user passphrase).
- **Server unwrap is scoped.** `pgsodium` decrypts the DEK inside a SECURITY
  DEFINER function; provider keys are zeroed after the request completes.
- **No key in logs.** Audit log stores `input_hash` (SHA-256), never the input.

## RLS

Every table has RLS enabled. Policies are keyed to `auth.uid()` + `org_id`
via `public.is_member_of(_org_id)`. `service_role` is restricted to worker
files only (enforced by lint rule + CI check).

## Audit log

- Append-only (trigger blocks UPDATE/DELETE except by `service_role`)
- Partitioned monthly (pg_partman)
- Retention: 13 months default, configurable per org
- Exposed to users via `audit.query` Edge Function

## Rate limiting

Per-user token bucket in `rate_limits` table. Enforced in
`lib/rateLimit.ts` before any provider call.

## Reporting

security@sgm-studios.com (configure before public launch)
