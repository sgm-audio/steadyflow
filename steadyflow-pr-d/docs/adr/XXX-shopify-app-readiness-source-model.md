# ADR XXX: Shopify App Store Readiness source model

**Status:** Accepted for experimental design
**Date:** 2026-08-02

## Context

SteadyFlow needs a future-facing way to represent Shopify App Store readiness requirements without
treating a community-maintained repository as policy. Shopify requirements can change, include
category-specific conditions, and are partly verifiable only through human review or Shopify-owned
surfaces.

The reviewed third-party repository is MIT-licensed and useful for discovery, but it is a Markdown
interpretation layer. It does not supply authoritative per-requirement versions, evidence, or
guarantees.

## Decision

Use an official-source-first requirement record. Every requirement must have an official Shopify
source URL, source title, and `verifiedAt` timestamp. Requirement IDs should preserve the official
section identifier where one exists, prefixed with a SteadyFlow namespace only if needed to avoid
collision.

Use the following source precedence:

1. Shopify legal terms and agreements.
2. [Shopify App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements).
3. Official Shopify documentation specific to the feature or category.
4. App-specific Partner Dashboard feedback.
5. Third-party research references, which are non-authoritative metadata only.

The requirement shape is defined in [SCOPE.md](../experimental/shopify-app-readiness/SCOPE.md).
`thirdPartyReference` may point to a third-party path or commit for research traceability, but an
official source is mandatory and the record must stand without the third-party reference.

Classify validation as `automatic`, `manual`, or `hybrid`. An automatic result is evidence about an
artifact, not a compliance determination. Absent, malformed, or insufficient evidence must remain
unknown; manual review must not be converted to pass by automation.

## Consequences

- Catalog maintenance costs are explicit: official sources must be rechecked before publication or
  when Shopify changes relevant policy.
- The module can cite a community repository without vendoring its content or inheriting it as a
  runtime dependency.
- This design supports future category gates and evidence collection without adding those features now.
- The model does not certify compliance, provide legal advice, or promise Shopify approval.

## Alternatives considered

### Vendor the third-party repository

Rejected. MIT permits it with notice retention, but it would import an interpretation layer,
duplicate Shopify content, increase staleness risk, and blur source authority.

### Use third-party requirement text as the catalog

Rejected. It lacks per-record official provenance and cannot resolve Shopify changes or
app-specific review feedback.

### Store only free-form findings

Rejected. Free-form findings cannot enforce official provenance, dates, categories, validation
modes, or future deterministic behavior.
