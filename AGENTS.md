# SteadyFlow — Agent Guide

**E-commerce growth system.** Shopify + Etsy primary, Amazon roadmap. Supabase single source of truth.

## Commands (run from root)

| Command | What |
|---------|------|
| `bash scripts/dev.sh` | Start everything: supabase + web app |
| `pnpm typecheck` | TypeScript strict mode across all packages |
| `pnpm lint` | ESLint strictTypeChecked + stylisticTypeChecked |
| `pnpm test` | Vitest (all packages) |
| `pnpm format` | Prettier + organize imports |
| `pnpm build` | Turbo build (all packages) |
| `pnpm contract` | Verify contract definitions |
| `pnpm typecheck && pnpm lint && pnpm test` | Pre-PR gate |
| `pnpm --filter @steadyflow/edge worker:loop` | Start queue worker pipeline |

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
apps/desktop      → Tauri v2 shell (stub)
apps/extension    → Chrome MV3 capture (stub)
packages/core     → Zod schemas, audit, crypto, contract definitions ← START HERE
packages/db       → Drizzle ORM (stub)
packages/contracts→ OpenAPI / tRPC generation (stub)
packages/sdk      → Typed BFF client, generated from contracts (stub)
packages/llm      → LLM adapter pattern, Deepseek default (stub)
packages/crypto   → Argon2id DEK derivation (stub)
```

## Contracts (the API surface)

Procedure definitions live in `packages/core/src/contracts/procedures.ts`. The `Router` type in `router.ts` is the single source of truth — all 10 procedures (`intel.analyzeShop`, `insights.list`, `audit.query`, `keys.set`, `keys.list`, `keys.test`, `org.llmConfig.get`, `org.llmConfig.set`, `intent.cancel`, `intent.list`). Adding one requires: input Zod schema, output Zod schema, `defineProcedure()`, and a `Router` entry.

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
**Never store plaintext provider keys server-side.**

## Testing

- Vitest, node environment, tests co-located as `*.test.ts`
- Coverage thresholds: 90% stmts/funcs/lines, 85% branches
- Run full suite: `pnpm test`
- Run single package: `pnpm --filter @steadyflow/core test`
- Run single file: `npx vitest run packages/core/src/result.test.ts`

## Pre-commit

`husky` + `lint-staged` — auto-runs prettier --write on staged files. If hook rejects, fix formatting and re-stage.

## Secrets that must NOT be committed

`.env`, `.env.*` (except `.env.example`, `.env.local.example`) are gitignored. Server-only vars: `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`.

## Setup

```bash
pnpm install
cp .env.local.example .env.local
# Fill in server-only secrets locally
```

## Commit convention

Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`. Branch from main as `feat/<scope>`.
