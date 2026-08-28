# SGM Studios — Master TODO

> Last verified: 2026-08-24. Two-repo system. Read before starting any work.

## Repos

| Repo | Path | Role | Branch / HEAD (verified) |
|---|---|---|---|
| **steadyflow** (private engine) | `C:\Users\scott\OneDrive\Desktop\steadyflow` | audit engine, 200-pt report, theme lint, PSI/CrUX, app fingerprints | `cursor/shopify-audit-modules` @ `a2958d2` |
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
- [ ] S1 Deno parity — make `@steadyflow/shopify-admin` Deno-importable; `workers-scrape` imports it (unblocks B1–B7)
- [ ] S6 Recurring-audit diff — persist/version leak list (needs `score_history` migration, B5)
- [ ] S10 Delight — copy-leak-list, per-leak time-to-fix chip, Printify-cost headline (UI)

### Phase B — SteadyFlow audit-gap closes (7 additions)
- [ ] B1. PSI/CrUX field-data fetcher — **Agent S3**
- [ ] B2. Theme lint (`@shopify/theme-check-node`) — **Agent S4**
- [ ] B3. App fingerprints + sitemap-aware crawl — **Agent S5**
- [ ] B4. 200-pt weighted scoring rubric (12 categories) — **Agent S2**
- [ ] B5. `score_history` + `app_fingerprints` migrations — **Agent S6**
- [ ] B6. Tracking verification — **Agent S2** (contract/schema side; worker wiring deferred)
- [ ] B7. Wire PSI/theme/crawl into worker pipeline — **deferred** until S3–S6 land

### Phase C — Acquisition site legal + SEO
- [ ] C1. Legal pages (`/legal/terms`, `/legal/privacy`, `/legal/disclaimer`, `/legal/refund`) — **Agent S8** (draft, pending SK lawyer review)
- [ ] C2. `app/sitemap.ts` + `app/robots.ts` + JSON-LD — **Agent S9**
- [ ] C3. Mobile nav fix + accessibility audit — **Agent S8**

### Phase D — Revenue plumbing (manual-first)
- [ ] D1. Square runbook (hivyr.io, GST/PST tax lines, deposit-then-balance, e-sign verify) — **Agent S10**
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
