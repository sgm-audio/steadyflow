# SteadyFlow

Private pilot, auditable Shopify revenue-optimization platform.

**Primary platforms:** Shopify + Printify (fulfillment)
**Status:** Active development — v0.x internal pilot (not yet public v1.0.0)
**Validation account:** Making Madi

Multi-platform adapters live in `packages/commerce`. **Experimental adapters** (Amazon, WooCommerce, Alibaba, Etsy) are not yet production-ready. Scaffold storefronts/themes with:

```bash
pnpm scaffold:shopify-theme ./themes/my-theme
pnpm scaffold:shopify-app ./apps/my-shopify-app
pnpm scaffold:wp-plugin ./wp/plugins/sf-bridge
pnpm scaffold:wp-theme ./wp/themes/sf-store
```

## Non-negotiable constraints

- TypeScript strict mode + Zod validation on every boundary
- Supabase (Postgres + RLS + Edge Functions) as single source of truth
- BYOK for all LLM calls (encrypted key envelopes, never plaintext at rest)
- Firecrawl primary, Playwright secondary (authenticated flows only)
- Tavily for enrichment (Hunter.io removed — see migration 20260712000004)
- Chrome MV3 extension (experimental) + web dashboard sharing a common core package
  (Tauri v2 desktop shell is experimental — see `apps/desktop`)
- Security: OS keychain, RLS, audit logs, proxy support
  (rate limiting: `rate_limit_take` RPC called from provider handlers in `_shared/rateLimit.ts`)
- Code must be auditable: every external action logged with user_id, timestamp, input hash, outcome

## Architecture

```
┌─────────────────┐  ┌─────────────────┐
│ Chrome MV3 ext. │  │ Web Dashboard   │
│ (experimental)  │  │ (ops view)      │
└────────┬────────┘  └────────┬────────┘
         │                   │
         └─── @steadyflow/core (TS, shared) ──┘
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
       Firecrawl          Tavily           LLM
       (BYOK proxy)       (BYOK proxy)     (BYOK proxy)
```

**Experimental surfaces** (not in v0.x scope): Tauri v2 desktop shell, Amazon SP-API, WooCommerce, Alibaba, Etsy adapters.

## Repo layout

```
steadyflow/
├── apps/
│   ├── edge/          # Supabase Edge Functions (BFF + workers)
│   ├── web/           # Next.js dashboard
│   ├── desktop/       # Tauri v2 shell — EXPERIMENTAL, not in v0.x scope
│   └── extension/     # Chrome MV3 capture — EXPERIMENTAL
├── packages/
│   ├── core/          # Zod schemas, audit hashing, crypto helpers, contracts
│   ├── db/            # Generated Supabase types (Drizzle ORM not implemented)
│   ├── llm/           # LLM adapter pattern (OpenAI-compatible providers)
│   ├── shopify-admin/ # Shopify Admin GraphQL + Printify cost audit
│   └── commerce/      # Multi-platform adapters (Shopify/Printify live; others experimental)
├── supabase/
│   ├── migrations/    # Database migrations
│   ├── functions/     # Edge Functions (Deno)
│   └── scripts/       # Database scripts
├── tooling/
│   └── devkit/        # Shopify + WordPress scaffolding CLI
└── turbo.json
```

**Note:** The following do NOT exist and should not be referenced:
- `packages/crypto/` — crypto lives in `packages/core/src/crypto/`
- `packages/sdk/` — removed (internal client only, not public)
- `packages/contracts/` — removed (contracts live in `packages/core/src/contracts/`)
- `infra/supabase/` — Supabase config lives under `supabase/`

## Daily workflow

Works the same on **Windows (PowerShell)**, macOS, and Linux.

### Once (machine setup)

1. Install [Node 20+](https://nodejs.org), [pnpm 9](https://pnpm.io/installation) (`corepack enable`), [Docker Desktop](https://www.docker.com/products/docker-desktop/), and the [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase` on Windows).
2. Clone and bootstrap:

```bash
git clone https://github.com/scottmills306/steadyflow.git
cd steadyflow
pnpm setup
```

`pnpm setup` installs deps, creates `.env.local` from the example, and runs `pnpm doctor`.

### Every day

```bash
pnpm doctor   # optional sanity check
pnpm dev      # Supabase + workers + web (http://127.0.0.1:3000)
# …work…
# Ctrl+C stops web + workers
pnpm stop     # stop local Supabase when you are done
```

| Command | What it does |
|---------|----------------|
| `pnpm setup` | First-time (or repair) bootstrap |
| `pnpm doctor` | Check Node, pnpm, Docker, Supabase CLI, `.env.local` |
| `pnpm dev` | Start local stack for the day |
| `pnpm stop` | Stop local Supabase |
| `pnpm check` | `typecheck` + `lint` + `test` before a PR |

**Login (local seed):** `dev@steadyflow.local` / `admin`  
**Studio:** http://127.0.0.1:54323

Local Supabase is its own project (`supabase/config.toml` → `project_id =
"steadyflow"`), independent of any other Supabase project on this machine.
It is never linked to a remote project by default — running `supabase link`
or `supabase db push` requires explicitly naming the target project first.

## BYOK

All provider keys (Firecrawl, Tavily, LLM) are wrapped with a per-org
DEK derived from a passphrase via Argon2id. Wrapped blobs sync to Supabase.
Server unwraps per-request via `pgsodium` and zeroes buffers after use.

**SteadyFlow never stores plaintext provider keys at rest.** Encrypted key envelopes are stored in Supabase and decrypted only for authorized provider requests.

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
