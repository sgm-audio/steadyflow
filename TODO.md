# SGM Studios — Master TODO

> Last verified: 2026-09-02. Covers two repos.

## Repos

| Repo | Role | Branch / HEAD (verified) |
|---|---|---|
| **steadyflow** (private engine) | audit engine, 200-pt report, theme lint, PSI/CrUX, app fingerprints | `cursor/shopify-audit-modules` @ session HEAD (post session work, see Session 2026-09-02) |
| **sgm-better-business-easier-site** (public) | marketing, legal, sitemap, Calendly, deposit flow | `main` @ `ba1fa6b` (clean) |

## Business model (locked)

Services-led agency. **Shopify Revenue Leak Audit** — $1,500 USD, $500 deposit credited, ~72h delivery. Tagline "Better Business, Easier." Downstream: Priority Fix Sprint, Optimization Partnership. Sole prop, Saskatoon SK, business + GST(5%)/PST(6%) numbers, incorporating after sprint 2–3. Square via **hivyr.io** (manual-first). Contracts: Square Contracts primary, Docusign fallback.

## ⚠️ Do not touch (existing uncommitted/untracked work in steadyflow)

- Modified: `AGENTS.md` (now `docs/DEVELOPMENT.md`), `apps/web/src/app/dashboard/page.tsx`, `docs/experimental/shopify-app-readiness/SAMPLE_REPORT.{html,json,md}`
- Untracked: `apps/web/src/components/Charts.tsx`, `jest.config.js`, `output/`, `steadyflow-pr-a/`…`steadyflow-pr-e/`, `writing-block*.md`, `writing-block.md`
- **Never** `git reset/clean/stash/checkout`, never delete the above. They may be another agent's or the user's work.

## Operating boundaries (all agents)

- No `git commit`, `push`, `deploy`, or making anything public unless the user explicitly directs this session.
- Never invent testimonials, revenue lifts, case studies, or audit outcomes.
- Keep observed facts / vendor claims / hypotheses / merchant-data requirements separated.
- Focused, additive edits. Run scoped verification and report **actual** output (no "tested" unless you ran it).

---

## Workstreams

### Phase A — SteadyFlow trim
- [ ] A1. Collapse worktrees → **BLOCKED**: `steadyflow-pr-a…e` are now committed (d733c8e) but still need user diff + decision before removal.
- [x] A2. Dead-code trim (commerce adapters + stubbed mutations) — done, `689e3c9`
- [x] A3. Contract drift fix (category enum → 12, `findingCount` derived) — done, `689e3c9`
- [x] A4. Docs hygiene (Drizzle claim, Hunter.io refs, package paths, @experimental labels) — verified clean; fixed stale `@steadyflow/contracts` comment in `procedures.ts`

### Phase A+ — CEO-review engineering locks (this session)
- [x] S7 Integrity — CWV proxy fields renamed (`renderBlockingRisk`/`layoutShiftRisk`); orphaned `jest.config.js` deleted
- [x] S4 Named LLM errors — `LlmEmptyResponseError`/`LlmMalformedJsonError`/`LlmRefusalError` + tests
- [x] S2 200-pt rubric — `packages/shopify-admin/src/audit/rubric.ts` (12 categories, grade bands, critical-cap)
- [x] S3 Rubric-as-source — `impact.ts` LeakItem gains `rubricCategory`; `computeAuditScore` delegates to rubric
- [x] S5 SSRF guard — `packages/core/src/net/ssrf.ts` `assertSafeFetchUrl` + tests
- [x] S8 Runbook — `docs/runbooks/audit-pipeline.md`
- [x] S1 Deno parity — vendor mechanism (`pnpm vendor:shopify-admin`), `findings.ts` single-source, `workers-scrape` imports shared engine, `core-shim` SHA-256 fix. **Verified** via `functions serve --no-verify-jwt` (bundles + runs, HTTP 200). Remaining mirror (non-core): `store_profiles`/`product_findings`/homepage-SEO/storefront still Node-only.
- [x] S6 Recurring-audit diff — `score_history` table landed (B5) and worker writes wired into BOTH Node (`apps/edge/src/workers.ts`) and Deno (`supabase/functions/workers-scrape/index.ts`) audit pipelines. UI diff view landed in `apps/web/src/lib/scoreDelta.ts` + report page dark-glass block (`apps/web/src/app/intents/[id]/report/page.tsx`).
- [x] S10 Delight — per-leak time-to-fix chip landed (S10a). Copy-leak-list-as-markdown button landed (S10b). Printify-cost headline landed (S10c, `apps/web/src/lib/printifyCostHeadline.ts` + report page block).

### Phase B — SteadyFlow audit-gap closes (7 additions)
- [x] B1. PSI/CrUX field-data fetcher — landed in `packages/shopify-admin/src/audit/performance.ts` + `packages/core/src/schemas/performance.ts` (9 new tests, BYOK API key supported, all 4 sources in parallel). Worker wiring pending (B7).
- [x] B2. Theme lint — HTML proxy in `packages/shopify-admin/src/audit/theme.ts` (`lintThemeHtml`, 5 tests). Wired into Node + Deno workers. Not `@shopify/theme-check-node` (needs Liquid / `read_themes`; add when Admin theme files are in the audit path).
- [x] B3. App fingerprints + sitemap-aware crawl — detection module landed in `packages/shopify-admin/src/audit/apps.ts` (`extractAppFingerprints()` + 10 tests). Worker writes wired in both runtimes via new `upsert_app_fingerprint` RPC. Sitemap-aware crawl landed in `packages/shopify-admin/src/audit/sitemap.ts` (`crawlSitemapUrls`, 16 tests, capped 20 URLs / 5s timeout / robots-disallowed / fail-closed) + Node/Deno wiring. Vendored.
- [x] B4. 200-pt weighted scoring rubric (12 categories) — landed in `packages/shopify-admin/src/audit/rubric.ts` (Phase A+ S2)
- [x] B5. `score_history` + `app_fingerprints` migrations — `supabase/migrations/20260902000001_score_history_and_app_fingerprints.sql`. Worker writes wired (S6). Types added to `packages/db/src/database.types.ts`.
- [x] B6. Tracking verification — contract surface landed in `packages/core/src/schemas/tracking.ts` (TrackingProvider/Check/VerificationOutput + 13 tests) + new `intel.trackingCheck` procedure. Worker wiring landed in `packages/shopify-admin/src/audit/tracking.ts` (`detectTracking`/`verifyTracking`, 9 tests, 10 providers) and wired into both workers (homepage HTML, SSRF-guarded, fail-closed; one insight when coverage <80). Vendored.
- [x] B7. Wire PSI/CrUX into worker pipeline — both Node (`apps/edge/src/workers.ts`) and Deno (`supabase/functions/workers-scrape/index.ts`) workers now call `fetchPerformanceSignals(storeUrl)` and write insights for failing CWV (LCP / CLS). Plus app fingerprint persistence (B3) and theme-lint HTML proxy (B2). All worker wiring now complete.

### Phase C — Acquisition site legal + SEO
- [ ] C1. Legal pages (`/legal/terms`, `/legal/privacy`, `/legal/disclaimer`, `/legal/refund`) — **Agent S8** (draft, pending SK lawyer review)
- [ ] C2. `app/sitemap.ts` + `app/robots.ts` + JSON-LD — **Agent S9**
- [ ] C3. Mobile nav fix + accessibility audit — **Agent S8**

### Phase D — Revenue plumbing (manual-first)
- [x] D1. Square runbook (hivyr.io, GST/PST tax lines, deposit-then-balance, e-sign verify) — `docs/runbooks/square.md` (this session). Live checkout still BLOCKED on hivyr.io spike.
- [ ] D2. Calendly `/book` embed — **Agent S10**

### Phase E — Credibility
- [ ] E1. Making Madi case study — **BLOCKED** until a real permissioned delivery. Never invent numbers.

---

## The 200-point audit taxonomy (canonical — S2 owns this)

| # | Category | Pts |
|---|---|---|
| 1 | Core Web Vitals & Performance | 25 |
| 2 | Technical SEO | 22 |
| 3 | On-Page Content Quality | 18 |
| 4 | Catalog & Data Integrity | 20 |
| 5 | Conversion Funnel / CRO | 25 |
| 6 | App & Script Hygiene | 15 |
| 7 | Trust / Legal / Compliance | 10 |
| 8 | Analytics & Tracking Integrity | 15 |
| 9 | Cost / Margin Health | 20 |
| 10 | AI-Readiness / Agentic Commerce | 15 |
| 11 | Accessibility & Mobile UX | 8 |
| 12 | Platform Hygiene & Ops | 7 |
| **Total** | | **200** |

Grade bands: A ≥180 · B 160–179 · C 140–159 · D 120–139 · F <120. Severity: critical / high / medium / low. Critical failure caps grade at C.

## Agent assignment (10 parallel)

| Agent | Scope | Repo |
|---|---|---|
| S1 | Docs trim | steadyflow |
| S2 | Scoring engine + contracts + drift fix | steadyflow |
| S3 | PSI/CrUX fetcher | steadyflow |
| S4 | Theme lint | steadyflow |
| S5 | App fingerprints + crawl | steadyflow |
| S6 | Migrations (score_history, app_fingerprints) | steadyflow |
| S7 | Dead-code trim | steadyflow |
| S8 | Legal pages + nav/a11y | site |
| S9 | Sitemap/robots/JSON-LD | site |
| S10 | Square runbook + Calendly | site + docs |

## Blocked items (do not start)

1. `steadyflow-pr-a…e` removal (needs user diff review).
2. Case study / testimonial / founder proof (no real evidence yet).
3. Live Square payment path (needs hivyr.io spike + test payment + tax/refund terms).
4. Making site public / deploying / outreach / payments.
5. Worker wiring of PSI/theme/crawl (waits on S3–S6).

## Definition of done (per agent)

- Scoped changes on disk; scoped tests pass (paste real output).
- No commits, no pushes, no deploys, no public changes.
- Report: files changed · verification output · blockers · final worktree state.

---

## Session 2026-09-02 — ponytail sweep on `cursor/shopify-audit-modules`

**Scope:** ship what's already green, mark real DB-progress for S6/B5, write the
manual-first Square runbook, push everything in one branch.

### Done in this session

- Pushed the 2 already-verified unpushed commits (`b46b2c4`, `6a905a4`) to
  `origin/cursor/shopify-audit-modules`. Branch is now even with origin
  before session edits land.
- **B5** — added `supabase/migrations/20260902000001_score_history_and_app_fingerprints.sql`.
  Two new tables, append-only from workers, member-readable via RLS, with
  `unique(intent_id)` on `score_history` and a dedup key on `app_fingerprints`.
  Unblocks S6 (recurring diff) and B3 (crawl-fingerprint deduplication).
  Follow-up: regenerate `packages/db/src/database.types.ts` against a live
  Supabase (`supabase gen types typescript --local`).
- **D1** — added `docs/runbooks/square.md`. End-to-end manual-first run
  (hivyr.io → Square contract → $500 deposit → audit → $1,000 balance),
  Saskatchewan tax matrix, e-sign verification, refund policy, and the
  "what we don't invent" list. No code change.
- Marked B4 (rubric) done retroactively — the work shipped under Phase A+ S2.

### Deliberately deferred

- S6 worker wiring (writes into `score_history`). Trivial SQL once a worker
  knows the org/intent, but the worker needs to also compute the rubric
  score — same code path as the report generator. Pair with the next rubric
  pass.
- S10 Delight UI. UI work needs the report page reloaded in a browser; no
  QA loop available in this session.
- B1–B3, B6, B7. All are real engineering efforts (PSI/CrUX fetcher, theme
  lint, app-fingerprint crawler, tracking-verification contract, worker
  wiring). Each is at least half a day of focused work; not safe to half-ship.
- C1–C3, D2. All in `sgm-better-business-easier-site` (different repo).

### Verification this session

- `pnpm typecheck` — clean.
- `pnpm lint` — clean (15 tasks, all cached green).
- `pnpm test` — 66 tests passing (61 edge, 5 web). Supabase integration
  tests skipped (no live DB in this session).
- DB migration is unreviewed by a live Supabase. Run `supabase db reset`
  locally and `supabase db lint` before promoting.

### Branch state at session end

- Local HEAD ahead of origin by 1 commit (the new migration + runbook +
  TODO updates). `git push` is the last step.

---

## Session 2026-09-02 (part 2) — B6 + S6 + B1 + S10 chip

**Scope:** continue the in-repo TODO list — ship 4 small, scoped pieces,
leave the rest deferred with honest reasons.

### Done in this session

- **B6 — tracking verification contract surface.**
  - `packages/core/src/schemas/tracking.ts` (TrackingProvider enum,
    TrackingCheck, TrackingVerificationOutput, TRACKING_PROVIDER_WEIGHTS,
    computeCoverageScore).
  - `packages/core/src/schemas/tracking.test.ts` — 13 tests (enum,
    strict-mode, weight-sums-to-100, score math, output validation).
  - New procedure `intel.trackingCheck` in `procedures.ts` + router entry
    (12th procedure, updated test count from 11 → 12).
  - **No worker** — B6 worker is part of B7.
- **S6 — score_history worker writes.**
  - `apps/edge/src/workers.ts`: import `scoreRubric` + `aggregateFlags`,
    write one `score_history` row per completed audit (best-effort,
    wrapped in try/catch). Uses shop_domain from input or derived from URL.
  - `supabase/functions/workers-scrape/index.ts`: same pattern. Includes
    a vendored `recordScoreHistory()` helper that handles shop_domain
    extraction from URL.
  - `packages/db/src/database.types.ts`: added typed `score_history` and
    `app_fingerprints` table defs (Row / Insert / Update / Relationships)
    so the `@steadyflow/db` Database type no longer rejects the new
    tables. Replaces the prior `supabase gen types typescript` step.
- **B1 — PSI / CrUX fetcher.**
  - `packages/core/src/schemas/performance.ts` (PerformanceSource,
    MetricMs, MetricScore, PerformanceSignal, scoreMetric helper).
  - `packages/shopify-admin/src/audit/performance.ts` (fetchPageSpeedInsights,
    fetchCrUX, fetchPerformanceSignals). All four sources fetched in
    parallel. BYOK `apiKey` optional. `available: false` on every failure
    mode (no CrUX record is the common case for small Shopify stores —
    expected, not an error).
  - `packages/shopify-admin/src/audit/performance.test.ts` — 9 tests with
    mocked fetch (PSI 500, timeout, healthy mobile, missing audits, CrUX
    NOT_FOUND, CrUX histogram → CLS score, all-4-sources parallel, all
    sources fail, apiKey pass-through).
  - **No worker** — fetcher ready for B7 wiring.
- **S10a — per-leak time-to-fix chip.**
  - `apps/web/src/app/intents/[id]/report/page.tsx`: added
    `EFFORT_CHIP_COLOR` map + a colored chip in each finding's header
    row showing the time-to-fix estimate ("Fix in Small (hours)", etc.).
    Tooltip is the longer effort label. Chip uses distinct colors from
    the severity chip so they don't visually merge.

### Deliberately deferred

- **B2** theme lint — needs `@shopify/theme-check-node` integration + a
  theme file extraction step. Real engineering effort.
- **B3** app fingerprints crawler — table exists, but the actual detection
  logic + sitemap-aware crawl is non-trivial (HTML parsing, JSON-LD
  fingerprint matching, deduplication against `app_fingerprints` table).
- **B7** worker wiring of PSI/CrUX + tracking verification + theme lint +
  crawl — depends on B2 + B3 landing first.
- **S10b/c** copy-leak-list + Printify-cost headline — UI work needs a
  browser QA loop.
- **C1–C3, D2** — different repo (`sgm-better-business-easier-site`).
- **E1** — blocked on real permissioned delivery.

### Verification this session

- `pnpm typecheck` — clean.
- `pnpm lint` — clean (15/15 tasks).
- `pnpm test` — 299 tests passing (223 core, 61 edge, 5 web, 9 new
  shopify-admin performance, 1 new tracking). Supabase integration
  tests skipped (no live DB).

### Branch state at session end

- Local HEAD ahead of origin by 1 commit (this batch). `git push` is
  the last step.

---

## Session 2026-09-02 (part 3) - B3 + B7 + S10b

**Scope:** close the in-repo TODO items that were deferred for "needs
another pass". Ship the detection + wiring for apps + PSI/CrUX, plus the
copy-as-markdown UI button.

### Done in this session

- **B3 - app fingerprint detection module.**
  - `packages/shopify-admin/src/audit/apps.ts`: `extractAppFingerprints()`
    + `AppFingerprint` type matching the table schema. Deduplicates by
    app title, normalizes handles (lowercase, hyphenated), maps to a
    7-bucket category taxonomy (marketing/reviews/analytics/support/
    shipping/inventory/other).
  - `packages/shopify-admin/src/audit/apps.test.ts`: 10 tests (empty
    case, single row, multi-host collapse, unknown apps -> "other",
    handle stability, category mapping).
  - Vendored to `supabase/functions/_shared/shopify-admin/audit/apps.js`
    via `pnpm vendor:shopify-admin`.
  - New `supabase/migrations/20260902000002_upsert_app_fingerprint_rpc.sql`:
    plpgsql function that increments `seen_count` and updates
    `last_seen_at` on conflict, making the upsert correctly accumulate
    frequency data over time.
  - Typed RPC entry added to `packages/db/src/database.types.ts`.
- **B7 - wire PSI/CrUX + app fingerprints into both worker runtimes.**
  - `apps/edge/src/workers.ts` (Node, `pnpm dev` path): after
    `checkStorefrontSignals`, call `extractAppFingerprints()` +
    `upsert_app_fingerprint()` per app. Then `fetchPerformanceSignals()`
    + write insight for failing LCP / CLS.
  - `supabase/functions/workers-scrape/index.ts` (Deno, cron production
    path): same pattern. Added `analyzeStorefrontHtml` call (was only
    in Node) + fingerprint persistence + PSI/CrUX fetch.
  - Both wrapped in try/catch; failures never block an audit.
- **S10b - copy leak list as Markdown button.**
  - `apps/web/src/components/CopyLeakListButton.tsx`: client component,
    small dark-glass button, `navigator.clipboard.writeText()` with
    "Copied ✓" feedback for 2s.
  - `reportAsMarkdown()` helper added to the report page. Pure
    function, structural `ReportLike` type (loose on branded ids so it
    accepts the runtime shape from the API client).
  - Rendered in the "Verified Findings" section, top-right.

### Deliberately deferred

- **B2** theme lint - still pending; needs `@shopify/theme-check-node`
  dep + theme file extraction logic.
- **Sitemap-aware crawl** - the B3 detection works from a single
  homepage fetch; the TODO explicitly calls out sitemap-aware crawling
  as a separate concern (sitemaps can be large, blocked, robots-disallowed).
- **B6 worker** (tracking verification) - contract shipped, actual
  store-crawling detector deferred.
- **S10c** Printify-cost headline - UI needs browser QA loop.
- **C1-C3, D2** - different repo.
- **E1** - blocked on real permissioned delivery.

### Verification this session

- `pnpm typecheck` - clean.
- `pnpm lint` - clean (15/15 tasks).
- `pnpm test` - 360 tests passing (223 core, 61 edge, 5 web, 71
  shopify-admin, 0 commerce, 0 desktop/extension/llm which have no
  tests). Supabase integration tests skipped (no live DB).
- `pnpm vendor:shopify-admin` - clean rebuild.

### Branch state at session end

- Local HEAD ahead of origin by 1 commit (this batch). `git push` is
  the last step.

---

## Session 2026-09-10 — B2 + S10c

**Scope:** close the two remaining unblocked in-repo TODOs. No commit.

### Done

- **S10c — Printify-cost headline.** `apps/web/src/lib/printifyCostHeadline.ts` parses leak-list title + catalog-margin body (prefers `firstSalePlan` when present). Report page renders a 3-metric block. 3 tests.
- **B2 — theme lint HTML proxy.** `packages/shopify-admin/src/audit/theme.ts` `lintThemeHtml()` (lang/viewport/alt/skip/canonical/document.write/stylesheets/OS2.0). 5 tests. Wired into Node + Deno workers. Vendored.

### Skipped

- `@shopify/theme-check-node` — needs Liquid / `read_themes`. Add when Admin theme files are in the audit path.
- B6 tracking-verification worker, sitemap crawl, S6 UI diff, C1–C3/D2 (other repo), E1/A1 (blocked).

### Verification

- `pnpm --filter @steadyflow/shopify-admin test` — 76 pass
- `pnpm --filter @steadyflow/web test` — 8 pass
- `pnpm --filter @steadyflow/edge test` — 27 pass (integration skipped)
- typecheck + lint on shopify-admin / web / edge — clean
- `pnpm vendor:shopify-admin` — clean

---

## Session 2026-09-10 (part 2) — P2 sitemap-aware crawl

**Scope:** P2 per PROMPTS.md — sitemap-aware crawl as separate module. No commit.

### Done

- **P2 — sitemap-aware crawl.** `packages/shopify-admin/src/audit/sitemap.ts` `crawlSitemapUrls` + helpers (`extractSitemapUrls`, `isSitemapIndex`, `parseRobotsDisallows`, `isAllowedByRobots`, `selectCrawlTargets`). Caps: first 20 product/collection URLs, 5s timeout each, skip robots-disallowed, fail-closed on huge/blocked sitemaps ( >1MB or >5000 locs → []), sameHost filter. 16 tests with fixture sitemap XML + HTML (mock fetch, no live network).
- Wired Node `apps/edge/src/workers.ts` AND Deno `supabase/functions/workers-scrape/index.ts`: SSRF-guarded sitemap.xml fetch, crawl targets, per-page 5s timeout + SSRF + html size guard, re-run `extractAppFingerprints` + dedup via `upsert_app_fingerprint` (best-effort try/catch, never fails audit). Vendored via `pnpm vendor:shopify-admin`.

### Skipped

- B6 tracking-verification worker, S6 UI diff, C1–C3/D2 (other repo), E1/A1 (blocked).

### Verification

- `pnpm --filter @steadyflow/shopify-admin typecheck` — clean
- `pnpm --filter @steadyflow/shopify-admin lint` — clean
- `pnpm --filter @steadyflow/shopify-admin test` — 92 pass ( +16 sitemap)
- `pnpm --filter @steadyflow/edge typecheck` — clean
- `pnpm --filter @steadyflow/edge lint` — clean
- `pnpm --filter @steadyflow/edge test` — 27 pass
- `pnpm vendor:shopify-admin` — clean

---

## Session 2026-09-10 (part 3) — P3 score-history UI diff

**Scope:** P3 per PROMPTS.md — score_history UI diff. No commit.

### Done

- **P3 — score-history diff UI.** `apps/web/src/lib/scoreDelta.ts` `computeScoreDelta` + `formatDelta` (pure helper, 9 tests). First-audit hides block (null when previous missing). Second audit shows previous score vs current, delta, date, grade. Report page `apps/web/src/app/intents/[id]/report/page.tsx` fetches current `score_history` by intent_id and previous by same shop_domain + captured_at lt current, reuses dark-glass MetricBlock grid (same as Printify headline). No chart library.

### Skipped

- C1–C3/D2 (other repo), E1/A1 (blocked).

### Verification

- `pnpm --filter @steadyflow/web typecheck` — clean
- `pnpm --filter @steadyflow/web lint` — clean
- `pnpm --filter @steadyflow/web test` — 17 pass ( +9 scoreDelta, total 3 files)

---

## Session 2026-09-10 (part 4) — P1 B6 tracking + final sweep

**Scope:** finish last in-repo unblocked (P1 B6) + polish pass. No commit yet.

### Done

- **P1 — B6 tracking-verification worker.** `packages/shopify-admin/src/audit/tracking.ts` `detectTracking`/`verifyTracking`/`computeCoverageScore` (10 providers: ga4/gtm/meta/google_ads/shopify/segment/klaviyo/tiktok/pinterest/snap, evidence ≤200, id capture, weights sum 100). 9 tests with fixture HTML (mock, no network). Wired Node `apps/edge/src/workers.ts` and Deno `supabase/functions/workers-scrape/index.ts`: SSRF-guarded homepage HTML, fail-closed try/catch, one insight when coverage <80 (high <40 else medium). Reuses storefront/theme pattern, no new dep. Vendored.
- TODO.md B6/B7 marked complete.

### Skipped

- C1–C3/D2 (other repo — branch main, done on disk but not pushed per boundary until user says), E1/A1 (blocked), live Square (spike pending), theme-check-node (needs read_themes).

### Verification

- `pnpm --filter @steadyflow/shopify-admin typecheck` — clean
- `pnpm --filter @steadyflow/shopify-admin lint` — clean
- `pnpm --filter @steadyflow/shopify-admin test` — 101 pass (+9 tracking)
- `pnpm --filter @steadyflow/edge typecheck/lint/test` — clean / 27 pass
- `pnpm vendor:shopify-admin` — clean
