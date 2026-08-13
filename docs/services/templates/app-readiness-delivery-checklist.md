# App Readiness Delivery Checklist

Run this end-to-end for every Shopify App Store Readiness Audit before handing off.

## Pre-scan

- [ ] Intake template completed and signed off.
- [ ] All required documents collected (see intake).
- [ ] Repository cloned at a known commit SHA; SHA recorded.
- [ ] App type + applicability assumptions recorded.
- [ ] Tier confirmed (static vs. full).

## Configure the scan

- [ ] `AppConfiguration` assembled from collected config (scopes, OAuth redirect URIs, privacy/support URLs, webhooks, extensions, dev URLs, mutations, external deps).
- [ ] No secret material (tokens, client secrets) included in the scan input.
- [ ] `commitSha` (40-hex) and `scannedBy` recorded.

## Run the scan

- [ ] Feature flag enabled (`STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED=true`).
- [ ] Scan completed without error; report generated (JSON + Markdown, HTML if requested).
- [ ] `reportHash` present and recorded.
- [ ] Stale-requirement warnings noted (if any).

## Manual review (full tier; static tier marks pending)

- [ ] `embedded-app` reviewed with evidence (App Bridge usage, embedded context).
- [ ] `theme-extension` reviewed with evidence (extension manifest + rendered behavior).
- [ ] Every `fail` / `warning` automatic finding spot-checked against the repository.
- [ ] Manual-review items recorded with reviewer identity, decision, and timestamps.

## Report review

- [ ] Report-review template completed (see `app-readiness-report-review.md`).
- [ ] False positives/negatives identified and annotated.
- [ ] No "compliant" / approval-promise language in the report.
- [ ] Every finding links to an official Shopify source.

## Deliver

- [ ] Report (JSON + Markdown) + checklist handed to client.
- [ ] Full tier: prioritized fix list delivered.
- [ ] Client confirms receipt; findings call scheduled if included.

## Post-delivery

- [ ] Evidence retained per retention policy (report, checklist, commit SHA).
- [ ] No client secrets/tokens retained.
- [ ] Repository copy deleted (unless a remediation contract requires retention).
- [ ] Upsell paths noted (remediation sprint, submission support, re-audit, storefront audit).
