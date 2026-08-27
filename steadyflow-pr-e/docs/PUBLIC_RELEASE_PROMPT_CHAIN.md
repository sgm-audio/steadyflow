# SteadyFlow → Public Release: Prompt Chain

Run these prompts **in order**, one phase at a time. Each prompt assumes prior phases are merged to `main`. Paste the **Context block** plus the **Prompt** into an agent session. Gate every phase with `pnpm check` and the phase-specific verification commands.

---

## Inventory (current gaps this chain closes)

| Area | Today | Target |
|------|-------|--------|
| License | `UNLICENSED`, all packages `"private": true` | OSI license + public npm scope decision |
| Surfaces | Shopify catalog live; orders/inventory push stub; Amazon/Woo/Alibaba/Etsy stubs; desktop/extension thin; Deno workers ≠ Node workers | Complete or explicitly demote to `@experimental` |
| Packages | `db`, `llm`, `sdk`, `contracts` stub/missing | Implement or remove from public API |
| Tests | 24 test files; coverage thresholds only in `core` | 90/85% enforced repo-wide in CI |
| CI | Single workflow: typecheck/lint/test/gitleaks/audit | Coverage, Deno check, RLS lint, release, badges |
| Community | No issue/PR templates, CoC, CODEOWNERS | Full GitHub OSS hygiene |
| Docs | README architecture ASCII | Mermaid diagrams, API reference, ADRs |
| Security | SECURITY.md draft; rate limit RPC unwired | Full audit report + remediations |
| Audit | `buildAuditEvent()` required by convention | Automated compliance scan in CI |

---

## Phase 0 — Truth audit & scope lock

**Goal:** Single source of truth for what v1.0.0 publicly promises.

### Context
```
Repo: steadyflow (pnpm monorepo, Supabase, Turborepo)
Read: README.md, AGENTS.md, CHANGELOG.md, packages/commerce/README.md
Do NOT change code yet.
```

### Prompt 0A — Surface inventory
```
Audit every user-facing surface in steadyflow and produce docs/SURFACE_MATRIX.md:

Columns: Surface | Path | Status (live|stub|roadmap) | Public v1 promise (ship|experimental|remove) | Blockers | Test coverage %

Must include:
- apps/web (all routes under apps/web/src/app)
- apps/edge worker-loop + supabase/functions/* (19 functions)
- apps/extension, apps/desktop
- packages/commerce adapters (shopify, printify, amazon, woocommerce, alibaba, etsy)
- packages/shopify-admin, packages/llm, packages/db
- All 10 contract procedures in packages/core/src/contracts/procedures.ts
- BYOK key providers in packages/core schemas
- Cron/queue path (pg_cron → edge workers vs local worker:loop)

Cross-check README claims vs reality. Flag contradictions (e.g. "production-grade" vs stub).
Output a recommended v1.0.0 scope: MAX 3 "ship" pillars + everything else labeled experimental.
Do not implement — document only.
```

### Prompt 0B — Architecture baseline diagrams
```
Using SURFACE_MATRIX.md and AGENTS.md, create docs/architecture/ with Mermaid source files:

1. system-context.mmd — users, Shopify, Printify, Supabase, external APIs
2. container.mmd — web, extension, edge functions, workers, packages
3. data-flow-analyze-shop.mmd — intent → queue → scrape → analyze → insights → audit_log
4. byok-crypto.mmd — passphrase → DEK → envelope → pgsodium unwrap → zero buffers
5. commerce-adapters.mmd — registry, selling/fulfillment/distributor roles

Each diagram: title, legend, color for live vs stub nodes.
Add docs/architecture/README.md embedding rendered Mermaid (GitHub-compatible).
No code changes except docs/.
```

**Gate:** Review SURFACE_MATRIX.md and approve v1 scope before Phase 1.

---

## Phase 1 — Openness & governance

**Goal:** Repo is legally and socially ready for strangers.

### Prompt 1A — License & package metadata
```
Make steadyflow public-open-source ready:

1. Choose license: Apache-2.0 (recommended for B2B SaaS tooling) OR MIT — document rationale in docs/adr/001-license.md
2. Replace UNLICENSED in README and root package.json
3. Set "private": false on packages intended for publish; keep apps private if not publishing
4. Add LICENSE file
5. Add copyright headers policy to CONTRIBUTING.md (optional per-file, required for new files)

Constraints: AGENTS.md verbatimModuleSyntax, no secrets in commits.
Verify: pnpm check
```

### Prompt 1B — Community governance files
```
Create GitHub community resources:

.github/
  ISSUE_TEMPLATE/bug_report.yml
  ISSUE_TEMPLATE/feature_request.yml
  ISSUE_TEMPLATE/security.md (links SECURITY.md, no paste secrets)
  PULL_REQUEST_TEMPLATE.md
  CODEOWNERS (default @scottmills306)
  dependabot.yml (npm, github-actions weekly)
  FUNDING.yml (optional placeholder)

Root:
  CODE_OF_CONDUCT.md (Contributor Covenant v2.1)
  SUPPORT.md — where to ask questions, expected response time
  GOVERNANCE.md — maintainer model, release approvers, semver policy

Update SECURITY.md:
  - Replace placeholder email with real security@ contact
  - Add disclosure timeline (72h ack, 90d fix target)
  - Link to .github/ISSUE_TEMPLATE/security.md

Verify: all YAML valid; no broken internal links
```

### Prompt 1C — README badges & open-source front door
```
Redesign README.md top section for public OSS:

Badges (shields.io):
  - CI status (GitHub Actions workflow CI on main)
  - License
  - pnpm version from packageManager field
  - Node engines
  - Coverage (codecov or coveralls — wire in Phase 4)

Sections:
  - One-line pitch
  - Badges row
  - Quick start (pnpm setup → pnpm dev) — already exists, keep
  - Documentation index linking docs/*
  - "Status" table: live vs experimental surfaces from SURFACE_MATRIX.md
  - Contributing link
  - Security link

Add docs/README.md as documentation hub.
Do not over-promise; experimental surfaces must say so.
```

**Gate:** Legal review of license choice; SECURITY contact is real.

---

## Phase 2 — Complete promised surfaces

**Goal:** Everything marked "ship" in SURFACE_MATRIX works end-to-end.

Run sub-prompts **in parallel** where noted; merge conflicts resolved in 2F.

### Prompt 2A — Contract & API surface (foundation)
```
Implement the public API layer promised in packages/core/src/contracts/:

1. packages/core/src/contracts/ — verify all 10 procedures have handlers in supabase/functions/
2. Add packages/contracts (or restore): OpenAPI 3.1 generation FROM procedures.ts (single source of truth)
3. Add packages/sdk: typed client generated from OpenAPI (fetch-based, no tRPC server required)
4. Wire apps/web to use @steadyflow/sdk instead of ad-hoc fetch where applicable
5. Add contract test: every Router key has a supabase/functions/<kebab-name>/index.ts that validates input/output Zod schemas

Constraints:
- z.strictObject on all boundaries
- Every external handler calls buildAuditEvent()
- deno check clean for all supabase/functions/*/index.ts

Verify: pnpm contract && pnpm check && deno check (add script if missing)
```

### Prompt 2B — Deno worker parity (production path)
```
CRITICAL GAP: Node apps/edge/src/workers.ts has Shopify real-data path; Deno supabase/functions/workers-scrape may not.

1. Diff Node workerScrape vs supabase/functions/workers-scrape/index.ts
2. Port shopify-admin short-circuit, competitor monitor, audit writes to Deno workers
3. Share logic via packages/core (pure TS) or thin Deno-compatible modules — no Node-only APIs in shared code
4. Integration test: supabase start → enqueue intent → pg_cron/worker fires → intent status completed
5. Document in docs/runbooks/local-production-parity.md

Verify: pnpm --filter @steadyflow/edge test && manual curl against local functions
```

### Prompt 2C — Commerce adapters (parallel tracks)
```
Complete or demote each @steadyflow/commerce adapter per SURFACE_MATRIX v1 scope.

Track C1 — Shopify (ship):
  - Implement listOrders via Admin GraphQL Orders API
  - Implement pushInventory via inventorySetQuantities or equivalent
  - Tests with mocked GraphQL (no live tokens in CI)

Track C2 — Printify (ship):
  - Implement order create in submitFulfillment (not just connectivity probe)
  - Document POD inventory semantics (unlimited blanks)

Track C3 — Amazon SP-API (experimental OR ship — follow SURFACE_MATRIX):
  - If ship: LWA auth, listCatalog, listOrders, FBA inventory — sandbox credentials in .env.test
  - If experimental: move to packages/commerce/experimental/amazon, update README

Track C4 — WooCommerce + Alibaba (experimental):
  - Minimum viable REST implementation OR explicit @experimental export with AdapterNotImplementedError only in experimental entrypoints

All adapters: return Promise.reject not async+throw; meta.stub accurate; registry tests updated.

Verify: pnpm --filter @steadyflow/commerce test && pnpm lint
```

### Prompt 2D — apps/web complete routes
```
Audit apps/web/src/app for stub pages, 404s, dead links.

For each route: /dashboard, /intents, /insights, /audit, /keys, /settings, /login
  - Real data from SDK/Supabase
  - Loading/error/empty states
  - Playwright smoke test per critical path (login → dashboard → create intent → see result)

Add apps/web/e2e/ with Playwright config; run in CI (Phase 5).

Verify: pnpm --filter @steadyflow/web test && playwright test
```

### Prompt 2E — Extension & desktop
```
Per SURFACE_MATRIX decision:

Extension (if ship):
  - MV3 capture flow: analyze current tab → POST intel.analyzeShop
  - Build loads in Chrome with pnpm --filter @steadyflow/extension dev
  - Extension E2E optional in CI (headless chrome)

Desktop (if experimental):
  - Move to apps/desktop/README.md with "experimental" banner
  - Scaffold src-tauri/ OR remove from root build turbo pipeline
  - Do NOT claim Tauri in main README if not runnable

Verify: pnpm --filter @steadyflow/extension build
```

### Prompt 2F — packages/db + packages/llm
```
packages/db:
  - Implement Drizzle schema mirroring supabase/migrations (or generate from Supabase types)
  - Export typed client used by apps/edge tests
  - Migration drift check script

packages/llm:
  - Implement adapter interface: complete, stream, embed (minimal)
  - Deepseek default + OpenAI-compatible base URL
  - Used by workers-analyze when LLM key present
  - Tests with mocked fetch

Wire rate_limit_take RPC: supabase/functions/_shared/rateLimit.ts must call DB RPC (currently unwired per README).

Verify: pnpm --filter @steadyflow/db test && pnpm --filter @steadyflow/llm test
```

**Gate:** SURFACE_MATRIX "ship" rows all green; experimental rows clearly labeled in docs.

---

## Phase 3 — Full test coverage

**Goal:** Enforce AGENTS.md thresholds repo-wide: 90% stmts/funcs/lines, 85% branches.

### Prompt 3A — Coverage infrastructure
```
1. Add vitest.config.ts at repo root OR per-package configs extending shared base
2. Root script: pnpm test:coverage → turbo run test:coverage
3. Merge lcov to coverage/lcov.info (vitest merge or nyc)
4. Add coverage/ to .gitignore; upload artifact in CI

Packages below threshold (prioritize):
  - apps/edge/src/workers.ts (large, critical)
  - apps/web (pages with 1-line index.test.ts stubs)
  - supabase/functions (Deno — add deno test or extract testable pure functions to core)

Do NOT lower thresholds.
```

### Prompt 3B — Coverage fill (run per package, parallel agents)
```
Package: @steadyflow/<name>

Raise test coverage to AGENTS.md thresholds (90/85%).
Focus on behavior, not snapshot trivia:
  - Error paths, Zod rejection of unknown keys
  - Audit event emission on external calls
  - RLS-negative cases where applicable

Co-locate *.test.ts. Mock external APIs.
Run: pnpm --filter @steadyflow/<name> test:coverage
Report final coverage table; block merge if below threshold.
```

### Prompt 3C — E2E & integration suite
```
Add tests/integration/ (or apps/edge/src/integration/):

1. supabase-local.test.ts — requires supabase start, uses service role from env
2. analyze-shop.e2e.test.ts — full intent lifecycle
3. byok-roundtrip.test.ts — keys.set → keys.test (mock provider)

CI job: integration (services: docker, supabase start in background)
Skip gracefully if SUPABASE_INTEGRATION!=1 for fork PRs.

Document in CONTRIBUTING.md how to run locally: SUPABASE_INTEGRATION=1 pnpm test:integration
```

**Gate:** `pnpm test:coverage` passes thresholds; CI uploads coverage report.

---

## Phase 4 — Security audit (full)

**Goal:** Documented threat model + automated checks + human review checklist.

### Prompt 4A — Automated security CI
```
Expand .github/workflows/:

security.yml (or extend ci.yml):
  - gitleaks (existing)
  - pnpm audit --audit-level=high (existing)
  - trivy fs scan (filesystem vulnerabilities)
  - semgrep --config p/owasp-top-ten (or GitHub codeql.yml)
  - deno lint + deno check on supabase/functions/
  - RLS policy test job (existing rls-security.test.ts)
  - Dependency review action on PRs

Fail CI on high/critical; moderate as warnings with documented exceptions in docs/security/exceptions.md
```

### Prompt 4B — Manual security audit checklist
```
Perform systematic security review; output docs/security/AUDIT_REPORT_v1.md:

Sections:
1. AuthN/AuthZ — JWT handling, org_id resolution, IDOR regression tests
2. BYOK/crypto — Argon2id params, AES-GCM nonces, buffer zeroing, pgsodium scope
3. SSRF — assertPublicHttpUrl coverage on all outbound URL fetches
4. RLS — every table has policies; pgTAP or SQL scan proves no public table without RLS
5. Secrets — .gitignore, gitleaks rules, no keys in test fixtures
6. Edge functions — service_role usage limited to workers; no client-controlled org headers
7. Supply chain — lockfile integrity, pinned GitHub Actions SHA
8. Rate limiting — rate_limit_take wired on all provider calls

For each finding: severity, file:line, remediation, status (fixed|accepted|deferred)
Fix all Critical/High before release; defer Low with ADR.
```

### Prompt 4C — Pen-test harness (optional but recommended)
```
Add scripts/security/smoke-attack.mjs (read-only, local only):

- Attempt IDOR: user A token + user B org_id → expect 403
- Attempt SSRF: intent with http://169.254.169.254 → expect rejection
- Attempt audit_log UPDATE as authenticated → expect trigger block

Run in CI against local Supabase (integration job).
Document in docs/security/TESTING.md
```

**Gate:** AUDIT_REPORT_v1.md has zero open Critical/High items.

---

## Phase 5 — System-wide audit compliance

**Goal:** Every external action writes to `audit_log` with redacted input hash.

### Prompt 5A — Audit compliance scanner
```
Build scripts/audit/compliance-scan.mjs:

1. Statically find all fetch()/axios/external API calls in apps/edge, supabase/functions, packages/*
2. Verify each path calls buildAuditEvent() or audit.write wrapper before return
3. Verify redactSecrets() applied to logged inputs
4. Output JSON report: compliant | missing_audit | missing_redaction

Add CI step: node scripts/audit/compliance-scan.mjs --fail-on-missing
Add allowlist file scripts/audit/allowlist.json for documented exceptions (must include rationale)
```

### Prompt 5B — Audit observability
```
1. docs/audit/EVENT_CATALOG.md — every action string, provider, redaction rules
2. Dashboard /audit page shows real events from audit.query procedure
3. Test: trigger analyze_shop → assert audit_log row with valid 64-char input_hash

Verify audit_log append-only trigger still blocks UPDATE/DELETE for authenticated role.
```

**Gate:** compliance-scan passes with empty allowlist (or only documented internal calls).

---

## Phase 6 — CI/CD & release pipeline

**Goal:** Professional automation: PR checks, main deploy, tagged releases.

### Prompt 6A — CI matrix
```
Refactor .github/workflows/ci.yml:

Jobs:
  quality — typecheck, lint, test, contract
  coverage — test:coverage, upload codecov
  security — gitleaks, audit, trivy, semgrep/codeql
  deno — deno check + deno lint on supabase/functions
  integration — supabase start + integration tests (main + label 'integration')
  e2e — playwright (main only or nightly)

Use pnpm/action-setup without version conflict (packageManager field only).
Node 20 via setup-node (set ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION if runner forces 24).
Concurrency groups per branch.

Add .github/workflows/release.yml:
  on: push tags v*
  jobs: quality + coverage + build + GitHub Release with CHANGELOG excerpt
```

### Prompt 6B — Deploy pipeline
```
Replace deploy job echo stub with real steps (or document external deploy):

Web: Vercel preview on PR, production on main (vercel/action or documented manual)
Edge: supabase functions deploy (existing, needs secrets)
Add docs/deploy/PRODUCTION.md — required secrets, rollback, migration order

Add environment protection rules recommendation in GOVERNANCE.md
```

### Prompt 6C — Badges & status
```
Wire README badges to real endpoints:
  - CI: github.com/scottmills306/steadyflow/actions/workflows/ci.yml/badge.svg
  - Coverage: codecov.io/gh/scottmills306/steadyflow
  - Security: gitleaks passing

Add docs/STATUS.md auto-generated script (optional): last CI run, coverage %, open audit findings count
```

**Gate:** Green CI on main; dry-run release workflow with tag v1.0.0-rc.1.

---

## Phase 7 — Visual design & documentation

**Goal:** Public-quality docs with diagrams, charts, and onboarding.

### Prompt 7A — Documentation site structure
```
Create docs/ hierarchy:

docs/
  getting-started/installation.md
  getting-started/daily-workflow.md
  guides/shopify-printify-setup.md
  guides/byok-keys.md
  guides/commerce-adapters.md
  reference/contracts.md (auto-generated from procedures)
  reference/environment-variables.md
  architecture/ (from Phase 0B)
  adr/ (architecture decision records)
  runbooks/
  security/

Add scripts/docs/generate-contract-docs.mjs → docs/reference/contracts.md from procedures.ts
Link all from docs/README.md
```

### Prompt 7B — Visual assets
```
Create visual assets in docs/assets/:

1. architecture/system-overview.png — export from Mermaid or Excalidraw (dark theme matching web app)
2. commerce-adapter-matrix.svg — live vs experimental grid
3. byok-flow.svg — key wrap/unwrap
4. ci-pipeline.svg — GitHub Actions flow

Add docs/assets/README.md with source files (.excalidraw or .mmd) for maintainability.
Embed in README and docs/architecture/README.md.

Optional: short GIF screen recording script in docs/assets/record-demo.sh (web dashboard login → insight)
```

### Prompt 7C — CHANGELOG & migration to semver
```
Rewrite CHANGELOG.md to Keep a Changelog format:

## [1.0.0] - YYYY-MM-DD
### Added
### Changed
### Fixed
### Security
### Removed (stubs demoted)

Archive session-style entries to CHANGELOG-archive.md
Add docs/releases/MIGRATION_v0_to_v1.md for breaking changes (sdk introduction, removed stubs from default export, etc.)
```

**Gate:** New contributor can follow docs/getting-started without asking you questions.

---

## Phase 8 — Public release

**Goal:** Tag v1.0.0, publish artifacts, announce.

### Prompt 8A — Release candidate
```
Prepare v1.0.0-rc.1:

1. Full pnpm check && pnpm test:coverage && integration tests
2. SURFACE_MATRIX.md — all "ship" rows verified manually
3. SECURITY.md contact live; AUDIT_REPORT_v1.md signed off
4. Update package.json version 1.0.0-rc.1
5. Create branch release/1.0.0-rc.1 → PR to main
6. Tag after merge: git tag v1.0.0-rc.1 && git push origin v1.0.0-rc.1
7. GitHub Release with:
   - Summary from CHANGELOG
   - Diagram from docs/assets/
   - Known limitations (experimental adapters)
   - Upgrade from rc feedback window (1 week)
```

### Prompt 8B — GA release v1.0.0
```
After rc soak:

1. Fix rc bugs
2. Version 1.0.0, tag v1.0.0
3. GitHub Release with generated release notes
4. Publish npm packages (if applicable): @steadyflow/core, sdk, commerce — use pnpm publish -r --access public
5. Enable GitHub Discussions (Q&A category)
6. Optional: post to Hacker News / Shopify dev community — use docs/ANNOUNCEMENT.md draft

Update README "Status" table to reflect 1.0.0 GA.
```

### Prompt 8C — Post-release maintenance prompts (recurring)
```
Monthly agent prompt (save as docs/maintenance/MONTHLY.md):

"Run steadyflow monthly maintenance:
- pnpm update --interactive
- pnpm audit; fix highs
- re-run scripts/audit/compliance-scan.mjs
- refresh docs/STATUS.md
- check SURFACE_MATRIX for drift
- verify supabase migration drift
Output PR with chore: monthly maintenance YYYY-MM"
```

---

## Master orchestration prompt

Use this to kick off the entire chain in a fresh agent session:

```
You are executing the SteadyFlow Public Release Program.

Read docs/PUBLIC_RELEASE_PROMPT_CHAIN.md and docs/SURFACE_MATRIX.md (create via Phase 0 if missing).

Rules:
- Follow AGENTS.md for all code (strict TS, Zod strictObject, buildAuditEvent on external actions, Conventional Commits)
- One phase per PR unless explicitly parallel-safe
- Never commit secrets
- Do not lower test coverage thresholds
- Prefer "experimental" label over shipping stubs

Start at the first incomplete phase. After each phase:
1. Run verification commands listed in that phase's Gate
2. Open PR to main with phase name in title: "release(phase-N): <summary>"
3. Stop and report status table before continuing

Current phase: [FILL IN]
Approved v1 scope from SURFACE_MATRIX: [FILL IN]
```

---

## Suggested PR sequence (18–22 PRs)

| # | Phase | PR title pattern |
|---|-------|------------------|
| 1 | 0A | docs: surface matrix and v1 scope |
| 2 | 0B | docs: architecture mermaid diagrams |
| 3 | 1A | chore: add Apache-2.0 license |
| 4 | 1B | chore: GitHub community templates |
| 5 | 1C | docs: README badges and status table |
| 6 | 2A | feat: OpenAPI SDK from contracts |
| 7 | 2B | fix: Deno worker parity with Node |
| 8–11 | 2C | feat(commerce): shopify orders, printify orders, … |
| 12 | 2D | feat(web): complete routes + playwright |
| 13 | 2E | feat(extension): MV3 capture flow |
| 14 | 2F | feat: db drizzle + llm adapter + rate limits |
| 15 | 3 | test: repo-wide coverage thresholds |
| 16 | 4 | ci: security audit pipeline + AUDIT_REPORT |
| 17 | 5 | feat: audit compliance scanner |
| 18 | 6 | ci: full matrix + release workflow |
| 19 | 7 | docs: site structure + visual assets |
| 20 | 8 | release: v1.0.0-rc.1 |
| 21 | 8 | release: v1.0.0 GA |

---

## Risk flags (decide before Phase 2)

1. **License:** Apache-2.0 vs MIT vs stay proprietary with public repo — legal choice affects patent grant.
2. **Amazon/Woo/Alibaba:** Shipping real adapters is months of work; demoting to `@experimental` is honest and faster.
3. **Deno/Node dual workers:** Must pick single production path or maintain parity forever.
4. **npm publish:** Public packages commit to semver API stability for `@steadyflow/core` and `@steadyflow/sdk`.
5. **Security contact:** `security@sgm-studios.com` must be monitored before public launch.

---

## Quick reference — verification commands

```bash
pnpm setup
pnpm doctor
pnpm check                              # typecheck + lint + test
pnpm test:coverage                      # after Phase 3
pnpm contract                           # after Phase 2A
deno check supabase/functions/**/*.ts   # add to package.json script
SUPABASE_INTEGRATION=1 pnpm test:integration
node scripts/audit/compliance-scan.mjs
playwright test                         # after Phase 2D
```
