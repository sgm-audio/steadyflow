# SteadyFlow — Agent Guide

**Shopify revenue-optimization platform.** Shopify + Printify primary; v0.x internal pilot (not yet public v1.0.0). Supabase single source of truth.

**Validation account:** Making Madi

## Commands (run from root)

| Command | What |
|---------|------|
| `pnpm setup` | Bootstrap deps + `.env.local` + doctor |
| `pnpm doctor` | Verify Node / pnpm / Docker / Supabase CLI |
| `pnpm dev` | Daily launcher: supabase + workers + web |
| `pnpm stop` | Stop local Supabase |
| `pnpm check` | Pre-PR gate: typecheck + lint + test |
| `pnpm typecheck` | TypeScript strict mode across all packages |
| `pnpm lint` | ESLint strictTypeChecked + stylisticTypeChecked |
| `pnpm test` | Vitest (all packages) |
| `pnpm format` | Prettier + organize imports |
| `pnpm build` | Turbo build (all packages) |
| `pnpm contract` | Verify contract definitions |
| `pnpm --filter @steadyflow/edge worker:loop` | Start queue worker pipeline |
| `pnpm scaffold:shopify-theme ./path` | Scaffold Online Store 2.0 theme |
| `pnpm scaffold:shopify-app ./path` | Scaffold Shopify app skeleton |
| `pnpm scaffold:wp-plugin ./path` | Scaffold WordPress plugin |
| `pnpm scaffold:wp-theme ./path` | Scaffold WordPress block theme |

**Turbo dependency chain:** lint, typecheck, and test all depend on `^build` (workspace dependencies must build first). Running `turbo run test` on a dirty tree will build deps before testing.

## TypeScript quirks

- **`verbatimModuleSyntax: true`** — use `import type { X }` for type-only imports, never `import { X }`
- `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` — optional access checks everywhere
- `noUnusedLocals`, `noUnusedParameters` — prefix discard with `_` (e.g. `_req`)
- `noPropertyAccessFromIndexSignature: false` — bracket vs dot doesn't matter
- `noEmit: true` by default; packages that emit (core) set `noEmit: false` + `composite: true`

## ESLint rules that bite

- `no-console: warn` — only `console.warn`/`.error` allowed
- `no-explicit-any: error` — use `unknown` instead
- `no-non-null-assertion: error` — no `foo!`
- `consistent-type-imports: error` — automatically fixed by `pnpm format` (prettier-plugin-organize-imports)
- `no-floating-promises`, `no-misused-promises` — every promise must be awaited or voided explicitly
- `require-await: error` — remove `async` from non-awaiting functions
- `eqeqeq: error` — always `===` / `!==` (null comparison explicitly allowed)

## Architecture (10-second version)

```
apps/edge         → Supabase Edge Functions (BFF + workers)
apps/web          → Next.js 15 dashboard
apps/desktop      → Tauri v2 shell (EXPERIMENTAL, not in v0.x scope)
apps/extension    → Chrome MV3 capture (EXPERIMENTAL, not in v0.x scope)
packages/core     → Zod schemas, audit, crypto, contract definitions ← START HERE
packages/db       → Generated Supabase types (Drizzle ORM not implemented)
packages/llm      → LLM adapter pattern (OpenAI-compatible providers)
packages/shopify-admin → Shopify Admin GraphQL + Printify cost audit
packages/commerce      → Multi-platform adapters (Shopify/Printify live; others experimental)
tooling/devkit         → Shopify + WordPress scaffolding CLI
```

**Note:** The following packages do NOT exist and should not be referenced:
- `packages/sdk/` — removed (internal client only)
- `packages/contracts/` — removed (contracts live in `packages/core/src/contracts/`)
- `packages/crypto/` — crypto lives in `packages/core/src/crypto/`

## Contracts (the API surface)

Procedure definitions live in `packages/core/src/contracts/procedures.ts`. The `Router` type in `router.ts` is the single source of truth — all 11 procedures (`intel.analyzeShop`, `insights.list`, `audit.query`, `keys.set`, `keys.list`, `keys.test`, `org.llmConfig.get`, `org.llmConfig.set`, `intent.cancel`, `intent.list`, `report.generate`). Adding one requires: input Zod schema, output Zod schema, `defineProcedure()`, and a `Router` entry.

Every procedure declares `auth`, `rateLimit`, `idempotent`. Every input/output uses `z.strictObject` or `.strict()` — unknown keys are rejected.

## Audit requirement

Every external action **must** call `buildAuditEvent()` and write to `audit_log`:
- Input is redacted via `redactSecrets()` before hashing
- Hash is SHA-256 of stable-json-sorted redacted input
- `audit_log` is append-only (trigger blocks UPDATE/DELETE)

## BYOK (crypto)

- DEK derived from user passphrase via Argon2id
- Provider keys wrapped with AES-GCM using the DEK
- Server unwraps via pgsodium per-request, zeroes buffers after
- **SteadyFlow never stores plaintext provider keys at rest.** Encrypted key envelopes are stored in Supabase and decrypted only for authorized provider requests.

**Note:** Hunter.io was removed (see migration 20260712000004). Supported providers: Firecrawl, Tavily, Shopify Admin, Printify, OpenAI-compatible LLMs.

## Testing

- **Vitest** is the runner (root `devDependencies` still list `jest`/`ts-jest`/`@types/jest` — stale, no jest config or tests exist; do not reach for Jest)
- Node environment, tests co-located as `*.test.ts`
- Coverage thresholds: 90% stmts/funcs/lines, 85% branches
- Run full suite: `pnpm test`
- Run single package: `pnpm --filter @steadyflow/core test`
- Run single file: `npx vitest run packages/core/src/result.test.ts`
- `apps/edge` integration tests need local Supabase running + `SUPABASE_SERVICE_ROLE_KEY` set (`apps/edge/vitest.global-setup.ts` wipes org-scoped rows first; fails closed — no hardcoded key)

## Pre-commit

`husky` + `lint-staged` — auto-runs prettier --write on staged files. If hook rejects, fix formatting and re-stage.

## Secrets that must NOT be committed

`.env`, `.env.*` (except `.env.example`, `.env.local.example`) are gitignored. Server-only vars: `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`.

## Repo gotchas

- `steadyflow-pr-*/` at repo root are git-worktree/parallel-agent snapshots (gitignored). Ignore them in searches; never commit them into `main`.
- `supabase/functions/_shared/shopify-admin/` is **vendored** — regenerate via `pnpm vendor:shopify-admin`, don't hand-edit.
- `apps/desktop` and `apps/extension` are EXPERIMENTAL and outside v0.x scope — don't spend effort there unless asked.

## Setup

```bash
pnpm setup
# Requires Node 20+, pnpm 9, Docker Desktop, Supabase CLI
# Daily: pnpm dev  →  work  →  pnpm stop
```

## Commit convention

Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`. Branch from main as `feat/<scope>`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
