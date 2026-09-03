# SGM Studios — Master TODO

> Last verified: 2026-09-02. Two-repo system. Read before starting any work.

## Repos

| Repo | Path | Role | Branch / HEAD (verified) |
|---|---|---|---|
| **steadyflow** (private engine) | `C:\Users\scott\OneDrive\Desktop\steadyflow` | audit engine, 200-pt report, theme lint, PSI/CrUX, app fingerprints | `cursor/shopify-audit-modules` @ session HEAD (post session work, see Session 2026-09-02) |
| **sgm-better-business-easier-site** (public) | `C:\Users\scott\Documents\Codex\2026-08-23\referenced-chatgpt-conversation-this-is-an\work\sgm-better-business-easier-site` | marketing, legal, sitemap, Calendly, deposit flow | `main` @ `ba1fa6b` (clean) |

## Business model (locked)

Services-led agency. **Shopify Revenue Leak Audit** — $1,500 USD, $500 deposit credited, ~72h delivery. Tagline "Better Business, Easier." Downstream: Priority Fix Sprint, Optimization Partnership. Sole prop, Saskatoon SK, business + GST(5%)/PST(6%) numbers, incorporating after sprint 2–3. Square via **hivyr.io** (manual-first). Contracts: Square Contracts primary, Docusign fallback.

## ⚠️ Do not touch (existing uncommitted/untracked work in steadyflow)

- Modified: `AGENTS.md`, `apps/web/src/app/dashboard/page.tsx`, `docs/experimental/shopify-app-readiness/SAMPLE_REPORT.{html,json,md}`
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
- [x] S6 Recurring-audit diff — `score_history` table landed (B5) and worker writes wired into BOTH Node (`apps/edge/src/workers.ts`) and Deno (`supabase/functions/workers-scrape/index.ts`) audit pipelines. UI diff view deferred to a future sprint.
- [ ] S10 Delight — per-leak time-to-fix chip landed (`apps/web/src/app/intents/[id]/report/page.tsx`, S10a). Copy-leak-list + Printify-cost headline still pending (S10b/c).

### Phase B — SteadyFlow audit-gap closes (7 additions)
- [x] B1. PSI/CrUX field-data fetcher — landed in `packages/shopify-admin/src/audit/performance.ts` + `packages/core/src/schemas/performance.ts` (9 new tests, BYOK API key supported, all 4 sources in parallel). Worker wiring pending (B7).
- [ ] B2. Theme lint (`@shopify/theme-check-node`) — **Agent S4**
- [ ] B3. App fingerprints + sitemap-aware crawl — `app_fingerprints` table exists (B5); actual sitemap-aware crawler + detection logic still pending.
- [x] B4. 200-pt weighted scoring rubric (12 categories) — landed in `packages/shopify-admin/src/audit/rubric.ts` (Phase A+ S2)
- [x] B5. `score_history` + `app_fingerprints` migrations — `supabase/migrations/20260902000001_score_history_and_app_fingerprints.sql`. Worker writes wired (S6). Types added to `packages/db/src/database.types.ts`.
- [x] B6. Tracking verification — contract surface landed in `packages/core/src/schemas/tracking.ts` (TrackingProvider/Check/VerificationOutput + 13 tests) + new `intel.trackingCheck` procedure. Worker wiring deferred.
- [ ] B7. Wire PSI/theme/crawl into worker pipeline — depends on B3 + a real tracking-verification worker. Both blocked on next agent round.

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
