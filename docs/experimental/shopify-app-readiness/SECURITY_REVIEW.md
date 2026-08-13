# Security Review — Experimental Shopify App Store Readiness Module

Scope: `packages/core/src/experimental/shopify-app-readiness/` (schema, registry, checks,
manual-review, report-generator, integration). Reviewed against 20 adversarial categories.

Legend for **Status**: `Fixed` = mitigated in this phase with regression tests; `Open` = documented
residual risk, mitigation deferred (requires a larger feature, external data, or the integration layer).

## Summary of fixes landed this phase

| Finding | Severity | Status |
|---|---|---|
| Secret leakage (config echo + raw report serialization) | Critical | Fixed |
| Unsafe repository execution → HTML injection in report output | Critical | Fixed |
| Authorization / org isolation (identity contract) | Critical | Fixed (partial) |
| False negatives from dead checks | High | Fixed |
| Repository-size denial of service (unbounded input) | High | Fixed |
| Audit-log completeness (redaction + hashing) | High | Fixed |
| Report manipulation (integrity hash) | High | Fixed |
| Stale requirement handling (status downgrade) | High | Fixed |
| Missing official sources (schema enforcement) | High | Fixed |

Regression tests: `packages/core/src/experimental/shopify-app-readiness/security.test.ts` (15 tests).

---

## Findings

### 1. False-positive risks
- **Severity:** Medium
- **Evidence:** Heuristic string/regex checks in `checks.ts`: `checkSecretLikeValueDetection` matches
  `/secret/i`, `/token/i`, `/password/i`, `/api[_-]?key/i` against the *entire* `JSON.stringify(config)`,
  which includes object *keys* (e.g. a benign field literally named `token`). `checkDeprecatedApiDetection`
  matches raw substrings (`ProductImage`, `/admin/api/2022-`) anywhere in the serialized config.
  `checkApiScopeExtraction` treats any `write_*` scope outside a 3-item allowlist as "excessive".
- **Exploit / failure:** Benign inputs that mention "token" or a deprecated-looking string cause spurious
  `fail`/`warning`, inflating failure counts and eroding trust in the report.
- **Remediation:** Keep detections heuristic and clearly label them; route uncertain detections to
  `manual_review` rather than `fail`. Scope secret-matching to *values* rather than serialized keys.
- **Status:** Open (documented; heuristic trade-off accepted for an experimental, config-only scan).

### 2. False-negative risks
- **Severity:** High
- **Evidence:** Before this phase, `integration.ts` hardcoded `oauth: undefined`, `developmentUrls: []`,
  `mutations: []`, `externalDependencies: []`, so four checks (`oauth-installation`, `dev-urls`,
  `direct-mutations`, `external-deps`) could never observe real data — three always returned `pass`
  and one always returned `fail`. The checks also only inspect a caller-supplied config object, never the
  app's repository source.
- **Exploit / failure:** A store with hardcoded dev URLs, direct DB mutations, or a missing OAuth flow
  would be reported `pass`/misreported, producing a false "ready" signal.
- **Remediation:** Checks now return `not_applicable` when their required field is absent (honest vs. a
  false `pass`), and `integration.ts` threads real values through instead of hardcoding empties.
- **Status:** **Fixed** (dead-check behavior) — residual: config-only scan cannot see repo code (see
  LIMITATIONS.md).

### 3. Outdated policy risks
- **Severity:** High
- **Evidence:** `requirements.json` is a static snapshot (`verifiedAt: 2026-08-02`). No mechanism re-fetches
  Shopify policy. Stale detection existed but did not influence the verdict.
- **Exploit / failure:** The report could assert `ready` against outdated requirements, giving false
  assurance that a store meets current Shopify rules.
- **Remediation:** `generateReadinessReport` now downgrades `overallStatus` from `ready` to `needs_review`
  whenever any requirement exceeds the 180-day staleness threshold, and stale warnings are surfaced.
- **Status:** **Fixed** (verdict gating) — residual: no automatic refresh of the registry (see LIMITATIONS.md).

### 4. Source-provenance failures
- **Severity:** High
- **Evidence:** Each requirement records `officialSourceUrl`, `officialSourceTitle`, `verifiedAt`, and
  `thirdPartyReference`. `ShopifyAppRequirementSchema` requires `officialSourceUrl` (`.url()`) and
  `verifiedAt` (`.datetime()`), so malformed/missing provenance is rejected at load time.
- **Exploit / failure:** Without provenance, a fabricated requirement could be trusted. With schema
  enforcement, a record missing a source cannot enter the registry.
- **Remediation:** Provenance presence is enforced; authenticity (that the URL is a *real* Shopify policy
  and the claim matches it) is not verifiable at runtime.
- **Status:** Fixed (presence enforcement) — residual: no URL authenticity verification (see LIMITATIONS.md).

### 5. License and attribution risks
- **Severity:** Medium
- **Evidence:** `requirements.json` records `thirdPartyReference` values such as
  `creativehubspace/shopify-app-store-requirements#...`, indicating the requirement corpus is informed by a
  third-party repository, but no license text, `NOTICE`, or attribution statement ships with the module.
- **Exploit / failure:** Substantial reuse of third-party wording without attribution could violate its
  license (e.g. MIT requires preservation of the copyright notice).
- **Remediation:** Add a `NOTICE`/attribution file and, before shipping, confirm the upstream license
  permits the degree of reuse and that paraphrased summaries are preferred over verbatim copying.
- **Status:** Open (documented; license review required before any public release).

### 6. Secret leakage
- **Severity:** Critical
- **Evidence:** `checkConfigurationParsing` previously stored `evidence: config` — the entire caller-supplied
  object — which was then serialized raw into the JSON/Markdown report. `reportToMarkdown` dumped
  `JSON.stringify(check.evidence)` unredacted.
- **Exploit / failure:** A caller passing a config containing `clientSecret`, `apiKey`, or a token would
  have those values written into a persisted/shared report (and, historically, the audit log placeholder
  logged raw payloads).
- **Remediation:** `checkConfigurationParsing` now reports only `{ fieldCount }`; report serialization
  (`reportToJson`, `reportToMarkdown`) redacts secret-shaped values via `redactSecrets`; audit emission
  uses `buildAuditEvent` (input redacted then SHA-256 hashed — no plaintext persisted).
- **Status:** **Fixed** — residual: `redactSecrets` (shared `packages/core/src/audit/redact.ts`) matches
  whole-key names (`token`, `secret`, `password`) but not camelCase variants like `clientSecret`;
  recommended follow-up is expanding those patterns (see LIMITATIONS.md).

### 7. Path traversal
- **Severity:** Low (no current surface)
- **Evidence:** The only file read is the registry via `join(__dirname, 'requirements.json')` — a fixed,
  developer-controlled path. No user-controlled filesystem path exists anywhere in the module.
- **Exploit / failure:** None today; a future "scan a local repo" feature would introduce the surface.
- **Remediation:** If repository scanning is added, resolve all paths against a whitelisted root, reject
  `..` segments, and use `path.resolve` + prefix checks.
- **Status:** Not applicable (documented; enforceable when repo scanning lands).

### 8. Symlink traversal
- **Severity:** Low (no current surface)
- **Evidence:** No filesystem traversal or directory walk exists; symlinks cannot be followed by this module.
- **Exploit / failure:** None today; same future surface as #7.
- **Remediation:** Use `fs.realpath` and reject entries resolving outside the allowed root; do not follow
  symlinks into sensitive directories.
- **Status:** Not applicable (documented).

### 9. Repository-size denial of service
- **Severity:** High
- **Evidence:** Input arrays (`scopes`, `webhooks`, `extensions`, `manualReviews`) were previously unbounded;
  a 1M-entry `scopes` array would be iterated and `join`ed during checks, risking CPU/memory exhaustion.
  There is no repository upload in scope.
- **Exploit / failure:** A malicious/buggy caller submits an oversized array, degrading the worker.
- **Remediation:** `ShopifyAppReadinessInputSchema` now caps list length (`.max(500)`) and string length
  (`.max(2000)`); `commitSha` must be a 40-char hex string.
- **Status:** **Fixed** (input bounds).

### 10. Malformed TOML, JSON, YAML, Liquid, JavaScript, and TypeScript
- **Severity:** Medium
- **Evidence:** The module never parses TOML/YAML/Liquid/JS/TS — it accepts a pre-parsed structured object.
  The only JSON it parses is its own `requirements.json`, validated with Zod; malformed JSON makes
  `getShopifyAppRequirements()` throw, which `runShopifyAppReadinessScan` catches and surfaces as `failed`.
- **Exploit / failure:** None for the listed formats (out of scope). A corrupted `requirements.json` fails
  the scan rather than producing a bogus report.
- **Remediation:** If format parsing is added later, validate each parser's output against a schema before
  use and never `eval`/execute parsed content.
- **Status:** Not applicable for TOML/YAML/Liquid/JS/TS; JSON is fail-closed (documented).

### 11. Generated files and vendored dependencies
- **Severity:** Medium
- **Evidence:** `requirements.json` is a vendored data file with `thirdPartyReference` pointing at a GitHub
  repo; it is not pinned to a specific upstream commit and has no license attribution.
- **Exploit / failure:** The corpus could silently drift from a stale or tampered upstream; attribution is
  absent.
- **Remediation:** Record the upstream commit/hash the data was derived from; add license attribution; treat
  the JSON as a pinned artifact reviewed on change.
- **Status:** Open (documented).

### 12. Misclassification of custom apps versus public apps
- **Severity:** High
- **Evidence:** Requirements carry an `applicability` list (e.g. `embedded_public_app`,
  `online_store_extension`), but the scan input has no app-type field and `runStaticChecks` executes every
  check regardless of applicability. A custom (non-public) app would be held to public-app requirements.
- **Exploit / failure:** Custom apps are flagged for OAuth/privacy/listing requirements that do not apply,
  generating misleading failures.
- **Remediation:** Add an app-type field to the input and filter checks by `applicability` before execution.
  Deferred: this is an input-model change (see LIMITATIONS.md) rather than a localized fix.
- **Status:** Open (deferred; requires an app-type model).

### 13. Incorrect applicability of billing or listing requirements
- **Severity:** High
- **Evidence:** The `category` enum includes `billing`/`listing`, but no billing requirements are modeled in
  `requirements.json`, and there is no applicability filtering for listing requirements.
- **Exploit / failure:** Billing compliance is never checked (false negative); listing requirements apply
  indiscriminately (false positive).
- **Remediation:** Model billing/listing requirements with correct `applicability`, and gate them on app type
  (with #12).
- **Status:** Open (deferred).

### 14. Unqualified compliance language
- **Severity:** Medium
- **Evidence:** Reports do not use the word "compliant" and end with a "not a compliance guarantee" footer.
  However the summary still renders an unqualified `Overall: READY` headline.
- **Exploit / failure:** A reader could interpret `READY` as a compliance assertion.
- **Remediation:** Keep the disclaimer; consider rendering the headline as "READY (non-binding)" or adding a
  persistent banner that this is not a compliance certification.
- **Status:** Open (documented; wording hardening recommended).

### 15. Missing official sources
- **Severity:** High
- **Evidence:** `ShopifyAppRequirementSchema` requires `officialSourceUrl` as a valid URL; a record without
  one is rejected when the registry loads. This closes the "missing source" gap.
- **Exploit / failure:** Without enforcement, unsourced claims could be trusted. With enforcement, missing
  sources cannot enter the registry.
- **Remediation:** Presence is enforced. Authenticity (URL points at a real Shopify policy and the claim
  matches) remains unverified at runtime.
- **Status:** Fixed (presence enforcement).

### 16. Stale requirement handling
- **Severity:** High
- **Evidence:** `calculateStaleWarnings` (180-day threshold) existed but did not affect the verdict.
- **Exploit / failure:** A `ready` verdict could be issued against stale data.
- **Remediation:** `generateReadinessReport` now downgrades `ready` → `needs_review` when stale warnings exist.
- **Status:** **Fixed** (verdict gating).

### 17. Authorization and organization isolation
- **Severity:** Critical
- **Evidence:** `runShopifyAppReadinessScan` trusts caller-supplied `organizationId`/`actorId` with no
  membership check. The module has no database access, so it cannot verify membership itself.
- **Exploit / failure:** A caller could attribute a scan (and its audit events) to an arbitrary org/actor,
  undermining tenant isolation and audit integrity.
- **Remediation:** `organizationId`/`actorId` must now be valid UUIDs (fail closed). Audit events are
  attributed via `buildAuditEvent`. A documented contract requires the integration layer (BFF / procedure
  router) to verify that `actorId` is an authenticated member of `organizationId` before calling.
- **Status:** **Fixed** (identity contract + fail-closed) — residual: membership enforcement lives in the
  integration layer, which is out of scope for this DB-less module (see LIMITATIONS.md).

### 18. Audit-log completeness
- **Severity:** High
- **Evidence:** The previous `emitAuditEvent` was a placeholder that only `console.warn`ed and neither
  redacted nor hashed input, violating the repo's audit requirement (`buildAuditEvent` + `audit_log`).
- **Exploit / failure:** Actions were untraceable and raw input could reach logs.
- **Remediation:** Emission now uses `buildAuditEvent` (redact → SHA-256 `inputHash`), emits an
  `analyze.appstore_readiness` event with `success`/`error` outcome and `durationMs`, and writes through an
  injectable `auditWriter` (default: console logger in non-production).
- **Status:** **Fixed** — residual: the default writer only logs; the caller must inject a writer that
  persists to `audit_log` (see LIMITATIONS.md).

### 19. Report manipulation
- **Severity:** High
- **Evidence:** Reports had no integrity mechanism; a generated report could be edited to claim a different
  `overallStatus` with no detection.
- **Exploit / failure:** A falsified report could mislead reviewers or consumers.
- **Remediation:** `ReadinessReport` now carries a `reportHash` (SHA-256 of the canonical report content via
  `computeReportHash`), enabling tamper detection by recomputation.
- **Status:** **Fixed** — residual: the hash is not a cryptographic *signature* (no key); it detects
  tampering but cannot prove authorship (see LIMITATIONS.md).

### 20. Unsafe repository execution
- **Severity:** Critical
- **Evidence:** The module executes no untrusted code (no `eval`, `child_process`, or script execution).
  However, `reportToHtml` performed naive regex Markdown→HTML conversion without escaping user-controlled
  content, allowing stored HTML/script injection.
- **Exploit / failure:** A malicious `appMetadata.name` (e.g. `<script>…</script>`) rendered in a browser
  would execute script in the viewer's context.
- **Remediation:** `reportToHtml` now HTML-escapes all content before the Markdown→HTML conversion, so
  user-controlled fields cannot inject markup. No code-execution surface exists and none is introduced.
- **Status:** **Fixed** (XSS); repository execution remains not applicable.

---

## Residual risks requiring follow-up (not fixed in this phase)

1. `redactSecrets` does not match camelCase secret keys (`clientSecret`, `accessToken`) — expand patterns in
   `packages/core/src/audit/redact.ts`.
2. Membership enforcement (org isolation) must be wired in the BFF/procedure router before this module is
   exposed over the API.
3. Default `auditWriter` only logs — inject a writer that persists to `audit_log` in production.
4. Registry is a static snapshot; add an automated refresh + diff workflow.
5. App-type model + applicability filtering to resolve findings #12 and #13.
6. License attribution for the third-party requirement corpus.
