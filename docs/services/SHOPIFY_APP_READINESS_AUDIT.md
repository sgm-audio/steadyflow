# Shopify App Store Readiness Audit — Service Delivery Playbook

**Service:** Shopify App Store Readiness Audit
**Capability:** `packages/core/src/experimental/shopify-app-readiness/` (experimental, feature-gated)
**Status:** Internal service-delivery playbook (pre-commercial). Runtime remains experimental and gated behind `STEADYFLOW_SHOPIFY_APP_READINESS_ENABLED=true`.

This document defines how the experimental Shopify App Store Readiness capability is packaged and delivered as an internal service. It is a delivery playbook, not website or outreach copy.

## Positioning

The Readiness Audit is a **risk-reduction and submission-readiness assessment**, not a compliance verdict. It reduces the probability of Shopify App Store review rejection by checking an app against a canonical, source-linked set of requirements and surfacing the gaps most likely to block approval — before the developer pays the submission/review cycle. It does **not** certify, approve, or guarantee any outcome.

## Ideal customer profile

- Independent Shopify app developers or small studios (1–5 people) building a **public** Shopify app for the App Store.
- Approaching first submission, or re-submitting after a prior rejection and wanting to de-risk the next attempt.
- Has a working app installable on a development store, and a git repository.
- Has a Shopify Partner organization (or can create one) and understands the app will go through Shopify's review.
- No in-house app-review or platform-compliance expertise; willing to do the fixes themselves (or buy a remediation sprint).

## Qualification criteria

Qualify a lead into the service when **all** of the following hold:

- The app targets a **public** App Store listing (not an internal-only / custom app). The engine's requirements are public-app oriented; custom apps are out of scope (see Exclusions).
- The repository is accessible with read access (GitHub/GitLab/etc.) and the operator can clone it.
- The app can be installed and exercised on a development store for the manual-review steps.
- The operator can obtain `shopify.app.toml`/`shopify.app.json`, extension configs, scopes, and OAuth redirect URIs.
- The app owner can provide or point to the required documents (below).

**Disqualify / refer out** when:

- The client needs a legal opinion, a security certification (SOC 2, PCI, pen test), or a compliance guarantee — out of scope.
- The app handles regulated data (health, financial, minors) where platform rules require specialist review.
- The client expects a guaranteed approval, a fixed review duration, or zero rejections — those cannot be promised.
- There is no repository access or no way to install the app (static-review tier can proceed on config alone; the full tier cannot).

## Required repository and Shopify access

| Asset | Access level | Used for |
|---|---|---|
| App source repository | Read (clone / collaborator) | Manual review of automatic findings, app-type confirmation, secret/deprecated-API spot checks |
| `shopify.app.toml` / `shopify.app.json` | Read | Scopes, OAuth redirect URIs, webhooks, app config |
| App extensions config (`extensions/`) | Read | Theme / checkout extension checks |
| Shopify development store | Install + exercise (read) | Manual-review evidence (App Bridge, OAuth flow, theme extension behavior) |
| Partner Dashboard (App listing draft) | Read | Name/description, privacy policy URL, support URL, listing fields |
| Printify (optional) | Not required for this service | N/A |

No **write** access to the client's production store or Partner account is required for the audit itself.

## Required documents

- `shopify.app.toml` (or `shopify.app.json`) — app configuration.
- Scopes list and OAuth redirect URIs.
- Webhook definitions (topics + endpoints).
- Privacy policy URL and support URL.
- App name and description (listing draft).
- Extension manifests (theme app extension, if applicable).
- Prior Shopify review feedback / rejection reasons (if any) — high-value context.

## Scope

The audit covers the **13 canonical readiness requirements** in the module's registry, each linked to an official Shopify source with a verification date:

- **Automatic static checks (11):** configuration parsing, API scopes, deprecated API usage, OAuth/installation, privacy-policy + support URLs, name/description, hardcoded development URLs, secret-like value detection, webhook identification, direct-mutation flags, external-dependency inventory.
- **Manual-review items (2):** embedded-app (App Bridge) and theme-extension behavior.

For each requirement the engine reports one of `pass`, `fail`, `warning`, `manual_review`, `not_applicable`, or `unknown`, with evidence where applicable. The report includes a stale-requirement warning (requirements older than 180 days) and an integrity hash (`reportHash`) for tamper detection.

The **full tier** additionally includes a line-by-line developer review of the repository against the flagged requirements and completed manual-review evidence.

## Exclusions

The Readiness Audit explicitly does **not**:

- Guarantee Shopify approval, a specific review duration, or zero rejections.
- Provide legal advice, compliance certification, or a security certification.
- Perform a full source-code security audit or penetration test; static checks are heuristic and config-based, not a substitute for a code review.
- Model billing/subscription requirements (not present in the current registry) or app-type-specific applicability beyond the embedded-public-app default.
- Submit the app to Shopify or manage the Partner Dashboard on the client's behalf.
- Modify the client's repository, store, or app (that is the Remediation sprint, separately scoped).
- Cover custom/private apps, or non-Shopify platforms.

## Deliverables

| Tier | Deliverables |
|---|---|
| **Static readiness review** | Readiness report (JSON + Markdown), manual-review checklist (Markdown), per-requirement findings with severity and official-source links, integrity hash. |
| **Full technical + manual readiness audit** | Everything in the static tier, plus: completed manual-review items with captured evidence, a repo review summary of each flagged requirement, and a prioritized fix list. |

Both tiers describe the outcome as a **risk-reduction and submission-readiness assessment**, never as an approval prediction.

## Delivery workflow

1. **Intake** — run the intake template, qualify the lead, collect access + documents, confirm app type.
2. **Configure the scan** — assemble the `AppConfiguration` from the collected config (scopes, OAuth redirect URIs, privacy/support URLs, webhooks, extensions, dev URLs, mutations, external deps). Record the commit SHA being reviewed.
3. **Run static checks** — execute the readiness scan (feature flag on) and capture the report.
4. **Manual review (full tier)** — complete the two manual items (embedded-app, theme-extension) and spot-check automatic findings against the repository.
5. **Generate + verify the report** — confirm the report hash, review findings for false positives/negatives, apply the report-review template.
6. **Deliver** — hand over the report + checklist; for the full tier, walk the prioritized fix list.

## Estimated operator effort

| Tier | Effort (estimate) |
|---|---|
| Static readiness review | 1–2 hours (config assembly + scan + report review) |
| Full technical + manual readiness audit | 4–8 hours (adds repo review, manual items, evidence capture, fix-list prioritization) |

Estimates assume the client has a standard embedded public app and the repository is straightforward. Custom extensions, large repos, or incomplete access add time.

## Pricing recommendation

| Tier | Recommended range |
|---|---|
| Static readiness review | USD $1,500 – $2,000 |
| Full technical and manual readiness audit | USD $2,500 – $3,500 |
| Remediation sprint | Separately scoped |
| Submission support | Separately scoped |

## Upsell paths

- **Remediation sprint** — implement the top-priority fixes surfaced by the audit (separate scope + pricing).
- **Submission support** — assist with preparing and submitting the App Store listing (separate scope).
- **Re-audit on change** — re-run after the developer makes fixes, or when Shopify policy changes (the registry staleness signal makes this natural).
- **Storefront audit** — cross-sell the Revenue Leak Audit for the app's own store/landing page.

## Risk and legal disclaimers

- This is a **risk-reduction and submission-readiness assessment**. It does not guarantee Shopify approval, a review duration, or that the app will not be rejected.
- It is not legal advice, a compliance certification, or a security certification.
- The requirement registry is a point-in-time snapshot; Shopify policies can change without notice. Stale requirements are flagged in the report but currency is not guaranteed.
- Static checks are heuristics over the supplied configuration; they are not a substitute for a full code or security review.
- Findings reference official Shopify sources and are intended to help the developer close gaps; the developer remains responsible for their own submission.

## Evidence-retention policy

- Retain the generated report (JSON + Markdown), the manual-review checklist, and the reviewed commit SHA for **12 months** after delivery.
- The report's `reportHash` (SHA-256 over canonical report content) is recorded to detect post-delivery tampering.
- Do not retain client secrets, tokens, or OAuth client secrets. The scan input must never include secret material (the input schema rejects secret fields; `redirectUris` only). If any secret is accidentally received, purge it immediately and redact it from retained artifacts.
- Source-code copies are deleted after the audit completes, unless a separate remediation contract requires retention.

## Quality-control checklist

- Every delivered report has a valid `reportHash` and a generation timestamp.
- Every finding links to an official Shopify source (no unsourced claims).
- The report does not use the word "compliant" and does not promise approval.
- Stale-requirement warnings (if any) are surfaced, not suppressed.
- The two manual items (embedded-app, theme-extension) are either completed with evidence or explicitly marked pending — never silently omitted.
- Client secrets/tokens are absent from all retained artifacts.
- The client's app type and applicability assumptions are recorded in the intake.

See the companion templates:

- `templates/app-readiness-intake.md`
- `templates/app-readiness-delivery-checklist.md`
- `templates/app-readiness-report-review.md`
