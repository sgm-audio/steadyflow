# SteadyFlow

An auditable, multi-platform **Shopify revenue-optimization platform**.

- **Primary platforms:** Shopify + Printify (fulfillment)
- **Status:** v0.x internal pilot (not yet public v1.0.0)
- **Validation account:** Making Madi
- **Single source of truth:** Supabase (Postgres + RLS + Edge Functions)

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
                ├── Auth · Storage · pgmq (queues)
                └── Edge Functions (BFF + workers)
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   Firecrawl          Tavily           LLM (BYOK)
```

## Repo layout

```
steadyflow/
├── apps/
│   ├── edge/          # Supabase Edge Functions (BFF + workers)
│   ├── web/           # Next.js dashboard
│   ├── desktop/       # Tauri v2 shell — EXPERIMENTAL
│   └── extension/     # Chrome MV3 capture — EXPERIMENTAL
├── packages/
│   ├── core/          # Zod schemas, audit hashing, crypto, contract definitions ← START HERE
│   ├── db/            # Generated Supabase types
│   ├── llm/           # LLM adapter pattern (OpenAI-compatible)
│   ├── shopify-admin/ # Shopify Admin GraphQL + Printify cost audit
│   └── commerce/      # Multi-platform adapters (Shopify/Printify live)
├── supabase/          # migrations, functions (Deno), scripts
├── tooling/devkit/    # Shopify + WordPress scaffolding CLI
└── turbo.json
```

> Removed and not to be referenced: `packages/crypto/` (→ `core/src/crypto/`), `packages/sdk/`, `packages/contracts/` (→ `core/src/contracts/`).

## Contracts (the API surface)

Procedure definitions live in `packages/core/src/contracts/procedures.ts`. The `Router` type in `router.ts` is the single source of truth — 11 procedures: `intel.analyzeShop`, `insights.list`, `audit.query`, `keys.set`, `keys.list`, `keys.test`, `org.llmConfig.get`, `org.llmConfig.set`, `intent.cancel`, `intent.list`, `report.generate`.

Every procedure declares `auth`, `rateLimit`, `idempotent`. Every input/output is `z.strictObject` / `.strict()` — unknown keys are rejected.

## Setup

Requires Node 20+, pnpm 9, Docker Desktop, Supabase CLI.

```bash
git clone https://github.com/sgm-audio/steadyflow.git
cd steadyflow
pnpm setup      # install deps, create .env.local, run doctor
pnpm dev        # Supabase + workers + web (http://127.0.0.1:3000)
pnpm stop       # stop local Supabase
```

| Command | Purpose |
|---------|---------|
| `pnpm setup` | First-time (or repair) bootstrap |
| `pnpm doctor` | Verify Node / pnpm / Docker / Supabase CLI |
| `pnpm dev` / `pnpm stop` | Start / stop local stack |
| `pnpm check` | Pre-PR gate: typecheck + lint + test |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Individual checks |
| `pnpm build` | Turbo build (all packages) |
| `pnpm scaffold:shopify-theme ./path` | Scaffold Online Store 2.0 theme |
| `pnpm scaffold:shopify-app ./path` | Scaffold Shopify app |
| `pnpm scaffold:wp-plugin ./path` / `:wp-theme ./path` | Scaffold WordPress |

Local seed login: `dev@steadyflow.local` / `admin`. Studio: http://127.0.0.1:54323.

## Testing

- Vitest, node environment, tests co-located as `*.test.ts`
- Coverage thresholds: **90%** statements/functions/lines, **85%** branches
- Single package: `pnpm --filter @steadyflow/core test` · single file: `npx vitest run packages/core/src/result.test.ts`

## Security & audit

- **BYOK** — provider keys wrapped with a per-org DEK (Argon2id), unwrapped per-request via `pgsodium`, buffers zeroed. Plaintext keys are never stored at rest.
- **Audit** — every external action writes to append-only `audit_log` (`user_id`, `timestamp`, SHA-256 input hash, `outcome`, `provider`, `action`, `duration_ms`). UPDATE/DELETE blocked except by `service_role`.
- **RLS** on every table · OS keychain · Firecrawl primary, Playwright secondary · Tavily for enrichment (Hunter.io removed).

## Commit convention

Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`). Branch from `main` as `feat/<scope>`.

## License

UNLICENSED — proprietary.
