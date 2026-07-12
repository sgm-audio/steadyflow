# Changelog

All notable changes to SteadyFlow will be documented in this file.

## [Unreleased]

### Session 2026-07-11 — pg_cron wired to drain the job queue

- **Root cause of "Intent: analyze_shop, no further output" reports:** confirmed the gap flagged (but not fixed) in the 2026-07-09 session — `worker-loop.ts` only runs in local dev, `apps/edge` isn't a deployed Cloudflare Worker (no `wrangler.toml`, `apps/edge/src/index.ts` is a `// Placeholder` stub), and `supabase/config.toml` had zero cron config. In any environment other than local dev with `pnpm worker:loop` running, queued intents never get dequeued — they sit at `queued`/`running` forever with no `error_message`, which is exactly the bare "Intent: analyze_shop / Status / Created / Updated / Input Hash" the intent detail page renders when it has nothing else to show.
- **Fix:** new migration `20260111000007_queue_scheduler.sql` enables `pg_cron`/`pg_net` and schedules 10s jobs that HTTP-POST to `workers-scrape`/`workers-enrich`/`workers-analyze`. The base URL + service_role key are read from Vault at call time (`invoke_edge_function()` no-ops silently if unset) rather than hardcoded, since they differ per environment and the key can't be committed. One-time setup (local and hosted) documented in new `supabase/scripts/setup-cron-secrets.sql`, following the existing `setup-kek.sql` convention.
- **Verified against the live local stack (applied directly via `psql`, not `supabase migration up`** — its migration history already has a version from a concurrent session/worktree not present on this branch, so a `migration repair` risked corrupting that session's in-progress state; the DDL is idempotent (`create extension if not exists`, `create or replace function`, `cron.schedule` upserts by job name) so re-running it later via the normal migration path is safe): extensions created, `invoke_edge_function()` created, all three `cron.schedule()` jobs active and firing every 10s per `cron.job_run_details`.
- **Ran `setup-cron-secrets.sql` against local dev**, first with the wrong key format (`sb_secret_...`, the newer opaque secret key) — Kong's auth layer 401s that as "Auth header is not 'Bearer {token}'". Corrected to the legacy JWT `SERVICE_ROLE_KEY`; requests now authenticate successfully (confirmed via `net._http_response`, `status_code` went from 401 to 503 with a *different* error). Script's local-dev instructions updated to say explicitly which key format is required.
- **Found a separate, pre-existing, stack-wide breakage — not caused by this change and left alone:** every edge function currently 503s with `BOOT_ERROR: Worker failed to boot`, including ones unrelated to this PR (`hello`, `keys-list`, `intel-list`). The edge runtime container serves the main checkout's `supabase/functions/` directory (not this worktree), which had in-progress uncommitted edits across nearly every function and `_shared/*.ts` file at the start of this session. This is very likely the direct cause of the original bug report, or at least compounding it — but it's someone else's in-progress work in the main checkout, so it wasn't touched here. Once that's fixed/committed, this PR's scheduler should drain the queue correctly — the scheduling, auth, and routing are now all confirmed working end-to-end up to the point where the function code itself fails to boot.

### Session 2026-07-09 (later) — BYOK key entry form + local worker loop

- **Worker loop:** nothing scheduled workers-scrape/workers-analyze/workers-enrich locally (no pg_cron, no scheduler anywhere) — confirmed live, 19 stale q:scrape messages had piled up. Added `apps/edge/scripts/worker-loop.ts` (`pnpm worker:loop`), a simple interval poller. Verified against the real local stack: drained the backlog, flipped 3 intents to succeeded.
- **`@steadyflow/crypto` implemented** (was a bare placeholder): `wrapProviderKey`/`unwrapProviderKey` — a fresh random DEK (AES-256-GCM) wraps the raw provider key, a passphrase-derived key (Argon2id, `@noble/hashes`, OWASP 2024 params) wraps the DEK. Passphrase and raw DEK never leave the browser. 5 tests including a real round-trip and a wrong-passphrase-rejects check.
- **Server-side KEK layer:** new migration `20260109000006_dek_pgsodium_wrap.sql` adds `wrap_dek()`/`unwrap_dek()` — SECURITY DEFINER functions that add a third encryption layer (pgsodium, server KEK) on top of the client's passphrase-wrapped DEK before it's persisted. Granted to `authenticated` + `service_role`.
- **`supabase/scripts/setup-kek.sql` was broken:** called `pgsodium.create_key('steadyflow-kek')` — wrong argument order for the installed pgsodium 3.x (`name` is the 2nd positional arg, not 1st; also needs `grant pgsodium_keyholder` first, which requires `supabase_admin`, not the `postgres` role migrations run as — so that grant can't live in a migration either). Fixed and verified against the real local KEK.
- **New:** `/keys/[provider]` — the BYOK key-entry form (was a dead link, flagged in the previous session). `/api/keys` route handler wraps up the flow: validates input, adds the pgsodium layer via RPC, upserts `keys_envelopes`. Discovered along the way that PostgREST expects `bytea` RPC/column values in Postgres's native `\x<hex>` text format, not base64 — verified empirically before writing the conversion helper.
- **Verified live, not just unit-tested:** logged in as the seeded dev user, wrapped a real key client-side, POSTed through `/api/keys`, then independently unwrapped the stored envelope (pgsodium RPC + passphrase layer) and confirmed it recovers the exact original key. Wrong passphrase correctly rejected.
- **Known inconsistency, not fixed:** `apps/edge`'s `keysSet` handler (the tested BFF/edge-function path) still stores the client-wrapped blob directly, without calling `wrap_dek()`. Nothing in the web app or extension actually calls that edge function today — `/api/keys` is the real, reachable path — so this was left alone rather than expanding scope further.

### Session 2026-07-09 — Full gate green: Supabase identity fix, edge typed + audited, desktop descoped

- **Supabase identity fix (root cause of all edge test failures):** local `supabase/config.toml` had `project_id = "shopicunt"` and a remote link to an unrelated `making-madi` project — leftover scaffold, never renamed. Corrected to `project_id = "steadyflow"`, cleared the stale local link cache, removed the mis-named `supabase_*_shopicunt` containers, and started a clean `supabase_*_steadyflow` stack. This alone fixed 12 of the 13 failing edge integration tests.
- **Edge test isolation:** added `vitest.global-setup.ts` to wipe org-scoped rows before the run, and set `fileParallelism: false` — integration tests share one live Postgres instance and were racing across files.
- **Real bugs found via the identity fix, not lint:**
  - `proxyFirecrawl`/`proxyLlm` threw when no BYOK key was configured, instead of returning the documented MVP placeholder (matching `proxyHunter`/`proxyTavily`) — meant every scrape/analyze intent hard-failed before any provider key was ever wired up.
  - `orgLlmConfigSet`'s audit log entry was mislabeled `action: 'intent.create'` (copy-paste leftover) instead of describing what happened.
  - `apps/edge` hashed audit `input_hash` values without redacting secret-shaped keys first — `@steadyflow/core` already ships a tested `buildAuditEvent`/`redactSecrets`/`hashObject` pipeline that was never wired up; `handlers.ts` now uses it instead of a hand-rolled duplicate.
- **Dependency corruption (pre-existing, from commit a4575f2):** the committed `pnpm-lock.yaml` had resolved versions (`zod@4.4.3`, `typescript@6.0.3`, `@types/node@26.1.0`) that violate every package.json's own declared semver range (`^3.23.8`, `^5.5.4`, `^20.14.10`) — a fresh clone would have failed to build immediately. Re-resolved within the declared ranges across the workspace.
- **`apps/web` fallout from the dependency fix:** `@supabase/ssr@0.5.2` (pinned `^0.5.0`) was ~65 minor versions behind `@supabase/supabase-js@2.110.1`; its `createServerClient` generics didn't line up with the current `SupabaseClient` type, silently resolving every query's row type to `never` across all 7 pages. Bumped to `^0.12.0`.
- **`packages/db`:** added generated Supabase types (`database.types.ts`, regenerate via `supabase gen types typescript --local`) and threaded `SupabaseClient<Database>` through every Supabase client in `apps/edge` and `apps/web`, eliminating ~150 `no-unsafe-*`/`as`-cast lint errors in favor of real inference.
- **Desktop descoped:** `apps/desktop` has no `src-tauri/`, no `tauri.conf.json` — never scaffolded despite being advertised as a shipped surface. Moved to Roadmap in README (architecture diagram + prose), `build` script now only compiles the shared TS stub instead of claiming a `tauri build` that can't succeed.
- **Tooling:** `.gitleaks.toml` used an old config schema current gitleaks rejects outright (`allowlist.rules` vs `allowlists`) — the security scan has been non-functional since it was added. Fixed the schema; scan now runs clean.
- **Known gap, not fixed this session:** `rate_limit_take` RPC exists in the DB (migration `0002_rate_limit_take`) and its own doc comment says "called from Edge Functions before any provider call," but no handler calls it — rate limiting is fully unimplemented despite being a README non-negotiable. Left as-is rather than rushed; needs its own pass.
- **Result:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — 14/14, 14/14, 146/146 tests, 10/10, all green (desktop's `build` is now an honest no-Tauri compile step, not a claimed Tauri build).

### Session 2026-07-08 (evening) — All Edge Functions populated + extension lint clean

- **Edge Functions:** Implement 8 remaining handlers — intel-list, intel-cancel, audit-query, org-llm-config-get, org-llm-config-set, workers-scrape, workers-enrich, workers-analyze
- **Extension lint:** Resolve all 91 ESLint errors (no-non-null-assertion, no-misused-promises, no-deprecated, no-unsafe-*, no-floating-promises, no-confusing-void-expression, no-base-to-string)
- **Cleanup:** Remove stale org-llm-config subdirectories

### Session 2026-07-08 — Edge Function restructure + lint fixes + extension v0.2.0

- **Restructure:** Move Edge Function `_shared` modules from `apps/edge/` to `supabase/` root
- **Edge Functions:** Add 7 new handlers — keys-list, keys-set, keys-test, proxy-firecrawl, proxy-hunter, proxy-llm, proxy-tavily (BYOK key management + provider proxies)
- **Config:** Enable `[db.vault]` in supabase/config.toml, add KEK setup script (supabase/scripts/setup-kek.sql)
- **Extension:** Bump to v0.2.0, add `build:zip` script, store listing draft, icon assets
- **Chore:** Update doc comments in core (dek.ts, provider.ts), add Vercel config, env template vars
- **Lint fix:** Resolve 16 ESLint errors in @steadyflow/llm (array-type, no-base-to-string, require-await, no-useless-assignment, no-unnecessary-condition, no-confusing-void-expression)
- **Test fix:** Fix extension VERSION test mismatch (0.1.0 → 0.2.0)

### Session 2026-07-07 (evening) — SteadyFlow MVP: Full Build, Test, Deploy, Release

**150+ files across 10 packages.** Full e-commerce growth system built from scaffold to production in a single session.

- **Foundation:** pnpm monorepo, TypeScript strict mode, 5 DB migrations (8 tables, RLS, pgmq)
- **Edge Functions:** 17 handlers (10 BFF + 4 BYOK proxies + 3 pgmq workers), 2 deployed live
- **LLM:** Deepseek adapter, shop analyzer with structured JSON prompts
- **Web Dashboard:** Next.js 15 — auth, intents, insights, keys, audit, settings (17 routes)
- **Chrome Extension:** MV3 — popup, context menu, page capture with Supabase auth
- **Security:** 131 tests (RLS, fuzz, gitleaks), CI/CD pipeline, audit hardening
- **Deploy:** v0.1.1 released, DB migrations pushed, 2 Edge Functions live

## [0.1.1] - 2026-07-07

### Added
- **Security:** RLS tests (131 total), Zod input fuzz, Gitleaks CI config, env-var-based test credentials
- **CI/CD:** GitHub Actions pipeline (typecheck, lint, test, secret scan, deploy)
- **Docs:** DEPLOYMENT.md, CHANGELOG.md, SECURITY.md

### Fixed
- Edge Functions: flat naming for Supabase compatibility
- Edge Functions: inline @steadyflow/core deps for Deno runtime (core-shim.ts)
- Web build: createServerClient cookie API, settings page type narrowing
- Audit: vite upgraded (9→2 vulns), Supabase keys moved to vitest env

### Infrastructure
- Edge Functions deployed: `intel-analyze-shop`, `insights-list`
- DB migrations applied to Supabase Managed (seed excluded)
- Supabase MCP configured in opencode
- GitHub releases pipeline established

## [0.1.0] - 2026-07-07
- **Foundation:** pnpm monorepo (Turborepo), TypeScript strict mode, ESLint strictTypeChecked, Prettier, Husky + lint-staged
- **Core package (@steadyflow/core):** Zod schemas (10 API contracts), audit hashing (SHA-256 + secret redaction), BYOK envelope encryption (AES-GCM), discriminated Result type, error codes
- **Database:** 8 tables (orgs, memberships, keys_envelopes, intents, sources, insights, audit_log, rate_limits, devices), 4 pgmq queues, RLS on every table, append-only audit_log trigger
- **Edge Functions:** 10 BFF handlers, 4 BYOK proxy handlers, 3 worker handlers (scrape, enrich, analyze), shared infrastructure (auth, response, CORS, queue, rate limiting, pgsodium envelope)
- **LLM (@steadyflow/llm):** LlmAdapter interface, Deepseek adapter (OpenAI-compatible), shop analyzer with structured JSON prompts, confidence scoring heuristic
- **Web Dashboard (Next.js 15):** Supabase SSR auth, login/dashboard/intents/insights/keys/audit/settings pages, intent submission API route
- **Chrome Extension (MV3):** Background service worker, context menu integration, content script page capture, popup UI with auth and submit flow
- **Security:** RLS tests (131 total), Zod input fuzz, Gitleaks CI config, env-var-based test credentials
- **CI/CD:** GitHub Actions pipeline (typecheck, lint, test, secret scan, deploy)
- **Docs:** DEPLOYMENT.md, CHANGELOG.md, SECURITY.md

### Dependencies
- Supabase Managed (Postgres + RLS + pgmq + Edge Functions)
- Next.js 15, React 18
- Zod, Drizzle ORM (schema only)
- Deepseek LLM (OpenAI-compatible) with Nvidia NIM planned

### Outstanding
- Local Edge Runtime blocked by SELinux (functions tested via vitest + DB integration)
- 9 npm audit vulns from vite in @steadyflow/desktop stub (inert)
- Local dev service_role key in test fixtures (non-production)
