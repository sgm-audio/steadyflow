# SteadyFlow

Private pilot — auditable Shopify revenue-optimization platform. Active development.

**Primary platforms:** Shopify + Printify (fulfillment)
**Experimental:** Amazon SP-API, Alibaba, WooCommerce, Etsy, Chrome extension, Tauri desktop

## Non-negotiable constraints

- TypeScript strict mode + Zod validation on every boundary
- Supabase (Postgres + RLS + Edge Functions) as single source of truth
- BYOK for all LLM calls — encrypted key envelopes stored in Supabase, decrypted only for authorized provider requests
- Firecrawl primary, Playwright secondary (authenticated flows only)
- Tavily for enrichment
- Security: RLS, audit logs, rate limiting on all provider calls
- Engineering: monorepo (Turborepo), contract tests, GitHub Actions CI/CD
- Code must be auditable: every external action logged with user_id, timestamp, input hash, outcome

## Architecture

```
┌─────────────────┐
│ Web Dashboard   │
│ (ops view)      │
└────────┬────────┘
         │
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
       Firecrawl            Tavily          LLM
       (BYOK proxy)     (BYOK proxy)     (BYOK proxy)
```

Experimental surfaces (not in primary product pitch): Chrome MV3 extension, Tauri v2 desktop shell.

## Repo layout

```
steadyflow/
├── apps/
│   ├── edge/          # Supabase Edge Functions (BFF + workers)
│   ├── web/           # Next.js dashboard
│   ├── desktop/       # Tauri v2 shell — experimental, not yet scaffolded
│   └── extension/     # Chrome MV3 capture — experimental
├── packages/
│   ├── core/          # Zod schemas, audit hashing, crypto, contract definitions
│   ├── db/            # Generated Supabase types
│   ├── llm/           # LLM adapter pattern (Deepseek default + OpenAI-compatible)
│   ├── shopify-admin/ # Shopify Admin GraphQL + Printify cost audit
│   └── commerce/      # Multi-platform adapters (Shopify/Printify live; Amazon/Alibaba/Woo experimental)
├── supabase/
│   └── functions/     # Edge Functions (BFF handlers + workers)
├── tooling/
│   └── devkit/        # Shopify + WordPress scaffolding CLI
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

All provider keys (Firecrawl, Tavily, LLM) are stored as encrypted key envelopes
in Supabase. Keys are wrapped with a per-org DEK via pgsodium and decrypted only
for authorized provider requests. Buffers are zeroed after use.

SteadyFlow never stores plaintext provider keys at rest. Encrypted key envelopes
are stored in Supabase and decrypted only for authorized provider requests.

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
