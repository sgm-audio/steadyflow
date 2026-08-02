# Experimental Shopify App Store readiness

## Phase boundary

This phase adds read-only domain primitives under `@steadyflow/core`. It does not add a public app,
OAuth or installation flows, billing, submission automation, multi-tenancy, persistence, external
calls, or remediation. The approved three-pillar v1 scope in `SURFACE_MATRIX.md` is unchanged; this
capability remains experimental.

## Assumptions

- The catalog is a curated universal baseline, not an exhaustive copy of Shopify's rules.
- Category-specific requirements remain out of scope until a later phase identifies an applicable category.
- Callers collect evidence; this phase validates and aggregates it but does not scan a repository or deployment.
- Missing automatic evidence is `unknown`; missing manual evidence is `manual_review`.
- Manual requirements cannot be marked `pass`, `fail`, or `warning` by automation.
- The score is the percentage of `pass` results among automatic `pass`, `fail`, and `warning` results.

## Sources and provenance

Every catalog entry contains an official `shopify.dev` URL and `lastVerifiedOn`. The catalog was
verified on 2026-08-02 against the [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements),
[privacy requirements](https://shopify.dev/docs/apps/launch/privacy-requirements), and
[app quality checks](https://shopify.dev/docs/apps/launch/app-store-review/app-quality-checks).

Shopify states that requirements can change and review decisions remain discretionary. Reports
therefore contain an explicit no-guarantee disclaimer.

The MIT-licensed [`creativehubspace/shopify-app-store-requirements`](https://github.com/creativehubspace/shopify-app-store-requirements)
repository was reviewed as a research accelerator for progressive grouping and uncertainty handling.
No third-party code or requirement text was copied, and no dependency was added.

## Later-phase integration boundary

A separately approved phase can add deterministic evidence collectors and an experimental report
surface. External calls must use `buildAuditEvent()`, redact input before hashing, and remain read-only.
