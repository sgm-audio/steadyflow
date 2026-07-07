# Changelog

All notable changes to SteadyFlow will be documented in this file.

## [Unreleased]

### Added (v0.1 MVP)
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
