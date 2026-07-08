# Changelog

All notable changes to SteadyFlow will be documented in this file.

## [Unreleased]

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
