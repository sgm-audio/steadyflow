# SteadyFlow

Production-grade, auditable e-commerce growth system.

**Primary platforms:** Shopify + Etsy
**Roadmap:** Amazon SP-API

## Non-negotiable constraints

- TypeScript strict mode + Zod validation on every boundary
- Supabase (Postgres + RLS + Edge Functions) as single source of truth
- BYOK for all LLM calls (never store keys server-side)
- Firecrawl primary, Playwright secondary (authenticated flows only)
- Hunter.io + Tavily for enrichment
- Tauri v2 desktop app + Chrome MV3 extension sharing a common core package
- Security: OS keychain, RLS, audit logs, rate limiting, proxy support
- Engineering: monorepo (Turborepo), tRPC where possible, contract tests, GitHub Actions CI/CD
- Code must be auditable: every external action logged with user_id, timestamp, input hash, outcome

## Architecture

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Tauri v2 app    │  │ Chrome MV3 ext. │  │ Web Dashboard   │
│ (desktop)       │  │ (capture)       │  │ (ops view)      │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                   │                   │
         └─────── @steadyflow/core (TS, shared) ──┘
                              │
                              ▼
                    Supabase (single source of truth)
                    ├── Postgres + RLS (every table)
                    ├── Auth (Supabase Auth)
                    ├── Storage (scraped artifacts)
                    ├── pgmq (queues)
                    └── Edge Functions (BFF + workers)
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
       Firecrawl          Hunter.io        Tavily / LLM
       (BYOK proxy)       (BYOK proxy)     (BYOK proxy)
```

## Repo layout

```
steadyflow/
├── apps/
│   ├── edge/          # Supabase Edge Functions (BFF + workers)
│   ├── web/           # Next.js dashboard
│   ├── desktop/       # Tauri v2 shell
│   └── extension/     # Chrome MV3 capture
├── packages/
│   ├── core/          # Zod schemas, audit hashing, crypto helpers
│   ├── db/            # Drizzle ORM + RLS SQL
│   ├── sdk/           # Typed BFF client (generated)
│   ├── contracts/     # OpenAPI / tRPC procedure definitions
│   ├── llm/           # LLM adapter pattern (Deepseek default)
│   └── crypto/        # Argon2id DEK + envelope wrap/unwrap
├── infra/
│   └── supabase/      # Migrations, RLS, pgmq, seeds
├── tooling/
│   └── ci/            # Reusable GitHub Actions workflows
└── turbo.json
```

## Quick start

```bash
# Install
pnpm install

# Copy env template and fill in server-only secrets locally
cp .env.local.example .env.local
# Edit .env.local — DO NOT commit

# Verify bootstrap
pnpm typecheck
pnpm lint
pnpm test
```

## BYOK

All provider keys (Firecrawl, Hunter, Tavily, LLM) are wrapped with a per-org
DEK derived from a passphrase via Argon2id. Wrapped blobs sync to Supabase.
Server unwraps per-request via `pgsodium` and zeroes buffers after use.

**The server never holds plaintext keys at rest.**

## Audit

Every external action writes to `audit_log` with:
- `user_id`
- `timestamp`
- `input_hash` (SHA-256 of redacted input)
- `outcome` (success | error | rate_limited)
- `provider`, `action`, `duration_ms`

`audit_log` is append-only (trigger blocks UPDATE/DELETE except by `service_role`).

## License

UNLICENSED — proprietary.
