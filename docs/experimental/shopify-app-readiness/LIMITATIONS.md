# Limitations — Experimental Shopify App Store Readiness Module

This document records the known functional and security limitations of
`packages/core/src/experimental/shopify-app-readiness/`. It complements
`SECURITY_REVIEW.md` (adversarial findings) by capturing the scope boundaries and
deferred work that are inherent to this experimental, config-only implementation.

## 1. Config-only scanning — no repository/code analysis

The module operates on a caller-supplied `AppConfiguration` object. It never reads,
parses, or executes the app's repository source. Consequences:

- Checks for `deprecated-api`, `dev-urls`, `direct-mutations`, and `secret-detection`
  only see whatever the caller declares in the config, so they can be bypassed by
  omission (false negatives). They now report `not_applicable` when the relevant field
  is absent rather than a false `pass`, but they cannot discover problems the caller
  did not surface.
- TOML/YAML/Liquid/JavaScript/TypeScript parsing is entirely out of scope today.

## 2. Static requirement registry (snapshot)

- `requirements.json` is a hand-maintained snapshot (`verifiedAt: 2026-08-02`). There is
  no automatic refresh, diff, or upstream sync. Staleness is surfaced and now gates the
  `ready` verdict (`ready` → `needs_review`), but currency is still a manual process.
- Requirement authenticity is not verifiable at runtime: the schema enforces that
  `officialSourceUrl` is present and a well-formed URL, but not that it points at a
  current Shopify policy or that the claim matches the policy text.

## 3. Provenance and licensing of the requirement corpus

`thirdPartyReference` values point at a third-party repository
(`creativehubspace/shopify-app-store-requirements`). The module ships no license
attribution or `NOTICE` for this corpus. A license review and attribution must be
completed before any public release.

## 4. No app-type model (custom vs. public)

The scan input has no app-type field, and `runStaticChecks` does not filter by the
`applicability` list on each requirement. A custom (non-public) app is therefore held to
public-app requirements (OAuth, privacy policy, listing), producing false positives.
Adding an app-type field plus applicability filtering is deferred (see SECURITY_REVIEW.md #12).

## 5. Billing requirements are not modeled

The `category` enum includes `billing`, but no billing requirements exist in
`requirements.json`. Billing compliance is therefore never checked (a false negative).
Listing requirements exist but are not gated by app type. See SECURITY_REVIEW.md #13.

## 6. Authorization enforcement lives outside the module

`runShopifyAppReadinessScan` has no database access, so it cannot verify that
`actorId` is a member of `organizationId`. It enforces that both are valid UUIDs (fail
closed) and attributes audit events to them, but the actual membership check must be
performed by the integration layer (BFF / procedure router) before this function is
called. Until that is wired, this module must not be exposed directly over the API.

## 7. Audit persistence is delegated to a writer

Audit events are built correctly (redacted + SHA-256 hashed via `buildAuditEvent`) and
passed to an injectable `auditWriter`. The default writer only logs to the console in
non-production. Production use requires injecting a writer that persists events to
`audit_log`.

## 8. Report integrity is a hash, not a signature

`reportHash` is an SHA-256 digest of the canonical report content, sufficient to detect
post-generation tampering. It is not a cryptographic signature, so it cannot prove who
authored the report. Key-based signing is deferred.

## 9. Shared redaction does not cover camelCase secret keys

`redactSecrets` (`packages/core/src/audit/redact.ts`) matches whole-key names such as
`token`, `secret`, `password`, `api_key`, but not camelCase variants like `clientSecret`
or `accessToken`. The module avoids echoing the config (see SECURITY_REVIEW.md #6), but
defense-in-depth would benefit from expanding those patterns in the shared utility.

## 10. Heuristic check quality

`secret-detection`, `deprecated-api`, and `api-scopes` are heuristic string/regex checks.
They are intentionally conservative but will produce both false positives (benign strings
that look secret/deprecated) and false negatives (patterns not in the allowlist). Results
should be treated as signals for manual review, not authoritative determinations.

## 11. Feature-gated and experimental

The module is disabled unless `STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED=true` and is not
wired into the procedure router, the `audit_log` persistence path, or any store-scoped
authorization. It is a design/validation aid, not a compliance certification. The report
footer and README should continue to state this explicitly.

## 12. HTML report rendering

`reportToHtml` is a minimal converter. It now HTML-escapes content to prevent injection,
but it is not a full Markdown renderer (tables/code blocks are approximate). Consumers
should prefer the JSON or Markdown output for machine consumption.
