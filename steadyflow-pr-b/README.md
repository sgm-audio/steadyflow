# SteadyFlow

Production-grade, auditable e-commerce growth system.

**Primary platforms:** Shopify + Printify (fulfillment), Etsy
**Roadmap:** Amazon SP-API, Alibaba sourcing, WooCommerce, Tauri v2 desktop app

Multi-platform adapters live in `packages/commerce`. Scaffold storefronts/themes with:

```bash
pnpm scaffold:shopify-theme ./themes/my-theme
pnpm scaffold:shopify-app ./apps/my-shopify-app
pnpm scaffold:wp-plugin ./wp/plugins/sf-bridge
pnpm scaffold:wp-theme ./wp/themes/sf-store
```

## Non-negotiable constraints

- TypeScript strict mode + Zod validation on every boundary
- Supabase (Postgres + RLS + Edge Functions) as single source of truth
- BYOK for all LLM calls (never store keys server-side)
- Firecrawl primary, Playwright secondary (authenticated flows only)
- Hunter.io + Tavily for enrichment
- Chrome MV3 extension + web dashboard sharing a common core package
  (Tauri v2 desktop shell is roadmap — not yet scaffolded, see `apps/desktop`)
- Security: OS keychain, RLS, audit logs, proxy support
  (rate limiting: `rate_limit_take` RPC exists in the DB but no handler calls
  it yet — not wired up, see CHANGELOG)
- Engineering: monorepo (Turborepo), tRPC where possible, contract tests, GitHub Actions CI/CD
- Code must be auditable: every external action logged with user_id, timestamp, input hash, outcome

## Architecture

```
┌─────────────────┐  ┌─────────────────┐
│ Chrome MV3 ext. │  │ Web Dashboard   │
│ (capture)       │  │ (ops view)      │
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
       Firecrawl          Hunter.io        Tavily / LLM
       (BYOK proxy)       (BYOK proxy)     (BYOK proxy)
```

Roadmap: Tauri v2 desktop shell, sharing the same `@steadyflow/core` package.

## Repo layout

```
steadyflow/
├── apps/
│   ├── edge/          # Supabase Edge Functions (BFF + workers)
│   ├── web/           # Next.js dashboard
│   ├── desktop/       # Tauri v2 shell — ROADMAP, not yet scaffolded
│   └── extension/     # Chrome MV3 capture
├── packages/
│   ├── core/          # Zod schemas, audit hashing, crypto helpers
│   ├── db/            # Generated Supabase types (Drizzle ORM not yet implemented)
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

## Daily workflow

Works the same on **Windows (PowerShell)**, macOS, and Linux.

### Once (machine setup)

1. Install [Node 20+](https://nodejs.org), [pnpm 9](https://pnpm.io/installation) (`corepack enable`), [Docker Desktop](https://www.docker.com/products/docker-desktop/), and the [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase` on Windows).
2. Clone and bootstrap:

```bash
git clone https://github.com/SGM-Studios/steadyflow.git
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
