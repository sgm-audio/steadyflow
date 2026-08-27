# SteadyFlow Surface Matrix

**Phase 0A deliverable** — inventory of every promised / user-facing surface vs reality.  
**As of:** 2026-08-03 · HEAD `main` (v1 scope lock audit)  
**Method:** static code audit (no coverage run; `%` columns are **estimates** unless noted).  
**Next:** execute [v1 Scope Decision](#recommended-v100-scope) — 5-PR implementation plan.

Coverage estimate key:

| Estimate | Meaning |
|----------|---------|
| ~0–20% | Placeholder / smoke-only tests |
| ~20–50% | Thin unit tests; major paths untested |
| ~50–80% | Meaningful unit coverage; gaps on integration |
| ≥90% | Meets AGENTS.md thresholds (**only `@steadyflow/core` enforces this today**) |
| n/a | No meaningful source under test |

---

## Recommended v1.0.0 scope

**Ship exactly three pillars.** Everything else is `experimental` or `remove` from public promises until later majors. This supersedes the archived `docs/archive/PUBLIC_RELEASE_PROMPT_CHAIN.md`.

| # | Pillar | What "ship" means |
|---|--------|-------------------|
| **1** | **Shopify Revenue Audit Engine** | Admin catalog audit → real insights; Printify cost join; weekly cron; Deno workers match Node real-data path; BYOK for `shopify-admin` + `printify` (+ Firecrawl/Tavily/LLM fallbacks); audit report for client delivery |
| **2** | **Operator Dashboard + Delivery Workflow** | All current routes work against local Supabase; `pnpm setup` / `dev` / `stop` / `check`; login → intents → insights → audit → keys → report; loading/empty/error/partial/completed/cancelled/provider-auth-failure states |
| **3** | **Auditable Execution Layer** | All 10 procedures have Edge Function handlers; audit + rate-limit on provider calls; Shopify path parity Node ↔ Deno; dry-run/approval/apply/verify/failure states; OpenAPI generated from `packages/core` contracts (internal artifact) |

**Explicitly experimental for v1 (do not advertise as production):** Amazon SP-API / FBA / FBM, WooCommerce, Alibaba, Etsy, Chrome extension, Tauri desktop, Drizzle ORM, npm-published SDK, competitor enrich worker depth.

**Remove from README/AGENTS public claims (or fix docs):** Hunter.io, `packages/crypto`, `packages/sdk` / `packages/contracts` as existing packages, "rate_limit_take unwired", "production-grade" unqualified, desktop as shipped surface.

---

## Claim contradictions (README / AGENTS / SECURITY vs code)

| Claim | Reality |
|-------|---------|
| README: "Production-grade…" | **Fixed** — now "Private pilot — active development" |
| README / diagram: Hunter.io | **Fixed** — Hunter removed from all docs |
| README: `rate_limit_take` "no handler calls it yet" | **Fixed** — called from `intel-analyze-shop`, `proxy-firecrawl`, `proxy-tavily`, `proxy-llm` via `_shared/rateLimit.ts` |
| README layout: `packages/sdk`, `packages/contracts`, `packages/crypto`, `infra/supabase` | **Fixed** — removed from layout; contracts/crypto documented in `packages/core`; functions under `supabase/` |
| AGENTS: `packages/db` "Drizzle ORM (stub)" | **Fixed** — now "Generated Supabase types" |
| AGENTS: `packages/contracts` / `sdk` stubs | **Fixed** — removed from AGENTS.md |
| AGENTS: `packages/llm` stub | **Fixed** — now "LLM adapter pattern, Deepseek default + OpenAI-compatible" |
| SECURITY: rate limit in `lib/rateLimit.ts` | **Fixed** — path corrected to `supabase/functions/_shared/rateLimit.ts` |
| SECURITY: Hunter keys | **Fixed** — removed from threat model |
| SECURITY: `audit_log` monthly pg_partman partitions | **Fixed** — removed; no pg_partman migrations exist |
| README: Tauri desktop roadmap "not yet scaffolded" | Matches code (`PLACEHOLDER`, no `src-tauri/`) — labeled experimental |

---

## 1. Web app (`apps/web`)

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| Root layout | `apps/web/src/app/layout.tsx` | live | ship | — | ~0 (no UI tests) |
| `/` → dashboard | `app/page.tsx` | live | ship | — | ~0 |
| `/login` | `app/login/page.tsx` | live | ship | — | ~0 |
| `/dashboard` | `app/dashboard/page.tsx` | live | ship | Needs real Shopify insights for “useful” demo | ~0 |
| `/insights` | `app/insights/page.tsx` | live | ship | — | ~0 |
| `/intents` | `app/intents/page.tsx` | live | ship | — | ~0 |
| `/intents/[id]` | `app/intents/[id]/page.tsx` | live | ship | Empty UI when workers never complete (Deno gap) | ~0 |
| `/keys` + `/keys/[provider]` | `app/keys/**` | live | ship | Needs `shpat_` for true E2E | ~0 |
| `/audit` | `app/audit/page.tsx` | live | ship | — | ~0 |
| `/settings` | `app/settings/page.tsx` | live | ship | — | ~0 |
| `POST /api/keys` | `app/api/keys/route.ts` | live | ship | — | ~0 |
| `POST /api/intents` | `app/api/intents/route.ts` | live | ship | — | ~0 |
| `POST /api/settings/llm` | `app/api/settings/llm/route.ts` | live | ship | — | ~0 |
| Auth login/callback/logout | `app/auth/**`, `logout` | live | ship | — | ~0 |
| Package entry | `apps/web/src/index.ts` | stub | remove claim | Stale “Phase 4” placeholder | ~100 of stub |
| Playwright E2E | — | roadmap | ship (Phase 2D) | Not in repo | n/a |

**Web overall:** **partial → ship** for routes; **tests are stub-only** (`index.test.ts`).

---

## 2. Edge BFF & workers

### 2a. Node package (`apps/edge`)

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| Package `index.ts` | `apps/edge/src/index.ts` | stub | remove claim | Stale placeholder | stub |
| Handlers (BFF logic) | `apps/edge/src/handlers.ts` | live | ship (shared logic / tests) | Must stay in sync with Deno functions | ~50–70 |
| Workers (Node) | `apps/edge/src/workers.ts` | live | ship (local + source of truth) | Includes Shopify Admin short-circuit | ~40–60 |
| Worker loop | `apps/edge/scripts/worker-loop.ts` | live | ship (local DX) | Does **not** drain `q:monitor` | ~0 |
| Deno tree under edge | `apps/edge/supabase/functions/` | partial | remove / consolidate | Only `import_map.json` | n/a |

### 2b. Supabase Edge Functions (`supabase/functions`)

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| `hello` | `hello/index.ts` | stub | experimental | Health only | n/a |
| `intel-analyze-shop` | `intel-analyze-shop/index.ts` | live | ship | — | n/a (no Deno tests) |
| `intel-cancel` | `intel-cancel/index.ts` | live | ship | — | n/a |
| `intel-list` | `intel-list/index.ts` | live | ship | maps `intent.list` | n/a |
| `insights-list` | `insights-list/index.ts` | live | ship | — | n/a |
| `audit-query` | `audit-query/index.ts` | live | ship | — | n/a |
| `keys-set` / `keys-list` / `keys-test` | `keys-*/index.ts` | live | ship | `keys-test` = envelope existence, not live API probe | n/a |
| `org-llm-config-get/set` | `org-llm-config-*/index.ts` | live | ship | — | n/a |
| `proxy-firecrawl` | `proxy-firecrawl/index.ts` | live | ship | BYOK | n/a |
| `proxy-tavily` | `proxy-tavily/index.ts` | live | ship | BYOK | n/a |
| `proxy-llm` | `proxy-llm/index.ts` | live | ship | BYOK | n/a |
| `workers-scrape` | `workers-scrape/index.ts` | **partial** | **ship (must complete)** | **No `@steadyflow/shopify-admin` intercept** — Firecrawl-only | n/a |
| `workers-analyze` | `workers-analyze/index.ts` | live | ship | LLM path | n/a |
| `workers-enrich` | `workers-enrich/index.ts` | partial | experimental | Marked Post-MVP; no persist | n/a |
| `workers-monitor` | `workers-monitor/index.ts` | live | experimental | Cron drains; local loop skips | n/a |
| Shared: context, audit, rateLimit, queue | `_shared/*.ts` | live | ship | Path docs wrong in SECURITY.md | n/a |

---

## 3. Cron / queue path

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| Queues `q:scrape|enrich|analyze|sync_keys|monitor` | migrations `20260105000001_*`, `20260712000002_*` | live | ship | — | n/a |
| pgmq wrappers | `20260105000005_pgmq_wrappers.sql` | live | ship | — | n/a |
| pg_cron drain (10s) | `20260111000007_queue_scheduler.sql` | live | ship | Needs Vault secrets (`setup-cron-secrets.sql`) | n/a |
| Weekly audit | `20260712000003_weekly_audit_scheduler.sql` | live | ship | Orgs need `shopify-admin` key + store URL | n/a |
| Local `worker:loop` | `apps/edge/scripts/worker-loop.ts` | live | ship | **Parity gap:** no `q:monitor`; Shopify path only on Node | ~0 |
| Production Deno drain | cron → `workers-*` | **partial** | ship | Scrape lacks Shopify Admin path | n/a |

**Critical production gap:** Weekly audit targets Shopify-ready orgs, but hosted `workers-scrape` never runs `runCatalogAudit`.

---

## 4. Extension & desktop

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| Chrome MV3 extension | `apps/extension` | partial | **experimental** | Hardcoded `127.0.0.1` URLs; thin tests | ~20–40 |
| Tauri desktop | `apps/desktop` | roadmap | **experimental** / hide from pitch | No `src-tauri/`; `PLACEHOLDER` | stub ~100 |

---

## 5. Commerce adapters (`packages/commerce`)

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| Registry | `adapters/registry.ts` | live | ship | — | ~40 (1 test file) |
| Shopify selling | `adapters/shopify/selling.ts` | **partial** | ship | `listOrders`, `pushInventory` unimplemented | ~40 |
| Printify fulfillment | `adapters/printify/fulfillment.ts` | **partial** | ship | Order create not wired; inventory N/A | ~0 direct |
| Amazon selling | `adapters/amazon/selling.ts` | stub | experimental | All methods reject | stub |
| Amazon FBA/FBM | `adapters/amazon/fulfillment.ts` | stub | experimental | All reject | stub |
| WooCommerce | `adapters/woocommerce/selling.ts` | stub | experimental | All reject | stub |
| Alibaba distributor | `adapters/alibaba/distributor.ts` | stub | experimental | All reject | stub |
| Etsy | (schema id only) | roadmap | experimental | No adapter class | n/a |
| Schemas / mappers | `schemas/*`, `mappers/shopify.ts` | live | ship | — | thin |

---

## 6. Shared packages

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| `@steadyflow/core` (schemas, audit, crypto, contracts) | `packages/core` | live | ship | — | **≥90 enforced** |
| `@steadyflow/shopify-admin` | `packages/shopify-admin` | live | ship | Needs real `shpat_` for E2E | ~30–50 (1 suite) |
| `@steadyflow/llm` | `packages/llm` | live | ship | Deepseek default; OpenAI-compatible via base URL | ~50–70 |
| `@steadyflow/db` | `packages/db` | live | ship | Generated Supabase types; no Drizzle (experimental) | ~20 |
| `@steadyflow/devkit` scaffolds | `tooling/devkit` | live | experimental | DX helpers, not product core | unknown |

---

## 7. Contract procedures (10)

Source: `packages/core/src/contracts/procedures.ts` → Edge Function mapping.

| Procedure | Edge Function | Status | v1 promise | Blockers | Coverage % |
|-----------|---------------|--------|------------|----------|------------|
| `intel.analyzeShop` | `intel-analyze-shop` | live | ship | Downstream worker parity | core contracts tests |
| `insights.list` | `insights-list` | live | ship | — | core + handlers |
| `audit.query` | `audit-query` | live | ship | — | core + handlers |
| `keys.set` | `keys-set` | live | ship | — | core + handlers |
| `keys.list` | `keys-list` | live | ship | — | core + handlers |
| `keys.test` | `keys-test` | partial | ship (document semantics) | Not a live HTTP probe of provider | thin |
| `org.llmConfig.get` | `org-llm-config-get` | live | ship | — | thin |
| `org.llmConfig.set` | `org-llm-config-set` | live | ship | — | thin |
| `intent.cancel` | `intel-cancel` | live | ship | Naming: `intel-cancel` vs `intent.*` | thin |
| `intent.list` | `intel-list` | live | ship | Same naming quirk | thin |

OpenAPI generator + typed SDK: **missing** (promised historically; contracts deleted as packages).

---

## 8. BYOK providers

| Provider | Schema | Proxy / consumer | Status | v1 promise | Blockers |
|----------|--------|------------------|--------|------------|----------|
| `firecrawl` | yes | `proxy-firecrawl`, workers | live | ship | — |
| `tavily` | yes | `proxy-tavily`, monitor/enrich | live | ship | — |
| `deepseek` | yes | `proxy-llm`, `@steadyflow/llm` | live | ship | — |
| `nvidia-nim` | yes | via LLM config / openai-compatible | partial | experimental | Thin adapter coverage |
| `groq` | yes | via LLM config | partial | experimental | Thin |
| `openai-compatible` | yes | `proxy-llm` | live | ship | — |
| `shopify-admin` | yes | Node `runCatalogAudit` only | **partial** | **ship** | Deno scrape path missing |
| `printify` | yes | shopify-admin cost join + fulfillment adapter | partial | ship | Order create incomplete |
| `amazon-sp-api` | yes | stub adapters | stub | experimental | No live client |
| `alibaba` | yes | stub distributor | stub | experimental | No live client |

---

## 9. Security / audit / CI surfaces

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| `buildAuditEvent` / redact / hash | `packages/core/src/audit/*` | live | ship | Compliance scanner not built | ≥90 (core) |
| RLS policies + tests | migrations + `rls-security.test.ts` | live | ship | Continuous SQL RLS scan missing | partial |
| Rate limiting | `_shared/rateLimit.ts` | live | ship | Docs outdated | thin |
| Gitleaks + `pnpm audit` | `.github/workflows/ci.yml` | live | ship | No CodeQL/Trivy yet | n/a |
| Coverage gates in CI | — | roadmap | ship | Only core has thresholds; CI does not upload coverage | n/a |
| SECURITY.md reporting email | `SECURITY.md` | partial | ship | Must be monitored before public | n/a |

---

## 10. Local DX

| Surface | Path | Status | v1 promise | Blockers | Coverage % |
|---------|------|--------|------------|----------|------------|
| `pnpm setup` / `doctor` / `dev` / `stop` / `check` | `scripts/*.mjs`, `package.json` | live | ship | Docker + Supabase CLI required | n/a |
| `scripts/dev.sh` | wraps `dev.mjs` | live | ship | — | n/a |

---

## Status rollup

| Bucket | Count (approx) | Examples |
|--------|----------------|----------|
| **live** | Majority of web routes + Edge BFF + core + shopify-admin catalog | Dashboard, keys, contracts handlers |
| **partial** | Critical path gaps | Deno scrape, Shopify orders/inventory, Printify order create, extension |
| **stub** | Commerce expansion + desktop entrypoints | Amazon, Woo, Alibaba, desktop |
| **roadmap / missing** | SDK/OpenAPI packages, E2E, full coverage CI | `packages/sdk`, Playwright |
| **doc debt** | Resolved | Hunter, rate-limit claim, layout tree, "production-grade" — all fixed in PR A |

---

## Approval checklist (before Phase 0B)

- [x] Accept **3-pillar** v1 scope above (or rewrite pillars here)
- [x] Confirm Amazon/Woo/Alibaba/Etsy stay **experimental** for v1
- [x] Confirm Chrome extension is **experimental** (not pillar)
- [x] Confirm desktop stays **experimental / hidden** until Tauri scaffold
- [x] Confirm Deno Shopify parity is a **v1 ship blocker** (PR B)
- [x] License stays **UNLICENSED** (proprietary) — no public OSS program until commercial gates met

**Phase 0B next:** Mermaid diagrams in `docs/architecture/` reflecting this matrix (live vs stub coloring).  
**Program:** Archived at `docs/archive/PUBLIC_RELEASE_PROMPT_CHAIN.md`
