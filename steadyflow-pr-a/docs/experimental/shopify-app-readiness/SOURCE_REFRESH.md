# Shopify App Store Readiness: official-source refresh runbook

**Status:** experimental maintainer process
**Last reviewed:** 2026-08-03

This runbook governs future requirement-catalog maintenance. It does not create a catalog, run a
check, access Shopify accounts, or change application behavior.

## Owner and cadence

A named SteadyFlow maintainer owns each refresh. Perform it:

- before publishing or changing any readiness catalog;
- monthly while the module remains active;
- within five business days of a Shopify changelog, review notice, or Partner Dashboard feedback
  affecting a supported application type;
- before any App Store submission that relies on the catalog.

## Authoritative inputs

Review these official sources in order:

1. [Shopify Partner Program Agreement](https://www.shopify.com/partners/terms)
2. [Shopify API License and Terms of Use](https://www.shopify.com/legal/api-terms)
3. [Shopify App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
4. [Shopify privacy requirements](https://shopify.dev/docs/apps/launch/privacy-requirements)
5. [Shopify app quality checks](https://shopify.dev/docs/apps/launch/app-store-review/app-quality-checks)

Add a feature-specific official Shopify page only when an in-scope application type uses that
feature. Third-party repositories, blog posts, and prior reports can suggest a research question
but cannot supply or override a requirement.

## Refresh procedure

1. Record the UTC date, maintainer, official URL, page title, and relevant official requirement ID.
2. Compare each supported requirement's ID, title, category, severity, validation mode,
   applicability, and source URL against the official source.
3. Classify a difference as `added`, `changed`, `removed`, `ambiguous`, or `source_unavailable`.
4. Independently write a concise SteadyFlow summary. Do not copy third-party prose.
5. Set `verifiedAt` to the date of the official review. Set `sourceVersion` only if Shopify itself
   publishes a stable version or date suitable for that specific record.
6. Capture the evidence needed for a future reviewer to reproduce the decision without recording
   secrets, store domains, credentials, customer data, or Partner Dashboard contents.
7. Submit the proposed catalog change and a short change summary for peer review.

## Change-control rules

- A new or materially changed official requirement is not marked `pass` by an existing future
  automatic check until its validation design and tests are reviewed.
- If source wording or applicability is ambiguous, retain the previous record only as historical
  context and mark the proposed record `unknown` pending human resolution.
- If an official source is unavailable, do not infer a replacement from third-party material.
- A Partner Dashboard finding applies to the affected app only; it may trigger a research issue but
  does not alter the general catalog without confirming official documentation.
- Any category outside the scope in [SCOPE.md](SCOPE.md) requires explicit product approval before
  catalog entries or checks are added.

## Refresh output

The maintainer's review must include:

| Field | Required content |
| --- | --- |
| Review date | UTC date of review |
| Official sources reviewed | URLs and page titles |
| In-scope application types | Exact applicability labels |
| Differences | Added, changed, removed, ambiguous, or unavailable items |
| Record decisions | Requirement ID, validation mode, severity, and `verifiedAt` update |
| Evidence limits | What remains manual, unknown, or unavailable |
| Reviewer | A second maintainer or an explicit documented exception |

## Release gate

Do not release catalog changes unless every new or changed record has an official Shopify URL,
official source title, `verifiedAt` date, applicability decision, and peer review. This gate is
about source integrity; it does not certify Shopify compliance or App Store approval.

For the source model and product limits, see [RESEARCH.md](RESEARCH.md), [SCOPE.md](SCOPE.md), and
[ADR XXX](../../adr/XXX-shopify-app-readiness-source-model.md).
