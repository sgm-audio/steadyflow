# Shopify App Store Readiness: research

**Status:** experimental design baseline only
**Research date:** 2026-08-02
**Scope:** source model and requirement-representation design; not a Shopify compliance assessment.

## Third-party repository assessment

The reviewed snapshot of `creativehubspace/shopify-app-store-requirements` is commit
`f727523a0dcf2a794ebbed8672af4f15ce044b9d`, dated 2026-08-02, with the commit subject
`various updates`. This indicates very recent maintenance, but does not establish that its content
matches Shopify at any future point.

It is a Markdown agent-skill pack, not a package or a machine-readable requirement dataset. Its
structure is:

- a master `SKILL.md` that classifies an app and routes reviews;
- four universal sections: policy, functionality, security, and listing;
- signal-gated categories: Online Store, payment, payment facilitator, purchase option, product
  sourcing, checkout customization, sales channel, post-purchase, mobile-app builders, donation,
  and blockchain;
- per-section prose requirements, checklists, code-search suggestions, and a report template.

The repository's own README declares Shopify documentation as the source of truth. Its content is
primarily human-authored summaries and operational instructions, with links to official sources.
It is not an official Shopify export, does not publish an official requirement version for each item,
and contains no evidence that it is generated from a Shopify API. Treat every prose rule as an
interpretation until checked against the linked Shopify source.

## License and attribution implications

The repository includes an MIT License, copyright 2026 Dennis Mathenge. MIT permits copying,
modification, and distribution, including in proprietary software, provided the copyright and
permission notice accompany copies or substantial portions.

Recommended posture: do not copy the repository's prose, checklists, code, or directory structure.
SteadyFlow can independently author a source model, category mapping, and requirement summaries
from official Shopify sources. A factual reference to the repository in this research record is not
a copied substantial portion. If a future phase copies any third-party text, code, or checklist
substantially, it must include the MIT notice and identify the copied material. No licensing
uncertainty blocks this design phase; the license file is present and unambiguous. Legal review is
required before any substantial reuse because this proprietary repository currently has no
third-party-notices process.

## Official Shopify source hierarchy

1. The [Shopify Partner Program Agreement](https://www.shopify.com/partners/terms),
   [API License and Terms of Use](https://www.shopify.com/legal/api-terms), and other applicable
   Shopify legal terms control policy obligations.
2. [Shopify App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
   control the general and category-specific review requirements.
3. Official Shopify implementation guidance for the applicable surface controls technical detail:
   [privacy requirements](https://shopify.dev/docs/apps/launch/privacy-requirements),
   [billing](https://shopify.dev/docs/apps/launch/billing), and the relevant API or extension guide.
4. [App quality checks](https://shopify.dev/docs/apps/launch/app-store-review/app-quality-checks)
   explain ongoing review context; Partner Dashboard feedback is authoritative for the affected app
   but is not a reusable general rule.
5. The third-party repository is discovery material only. It must never override, supplement by
   inference, or be presented as an official source.

Shopify states that requirements can change and that App Review retains discretion. A requirement
record is therefore a dated evidence pointer, not a guarantee of listing acceptance.

## Comparison with current official requirements

The reviewed snapshot covers the current top-level App Store sections 1 through 5 and its category
map includes sections 5.1 through 5.11. It also contains currently documented functionality items
for Sidekick extensions (2.2.8 and 2.2.9) and sensitive scopes through
`read_checkout_extensions_chat` (3.2.5). No direct contradiction was found in this limited
comparison.

The following limitations prevent direct import:

| Finding | Consequence for SteadyFlow |
| --- | --- |
| Its source link is section-level, not a per-requirement provenance record. | Store an official URL, title, and `verifiedAt` on every SteadyFlow requirement. |
| Prose mixes direct policy statements, implementation advice, and agent heuristics. | Keep only independently verified requirement summaries; record heuristics as non-normative notes. |
| It uses "likely passing/failing/needs review" report language. | Do not reuse those outcomes as policy truth; SteadyFlow will use validation modes and evidence, not compliance assertions. |
| Category signals are useful but incomplete. | Classify applicability conservatively; absence of a source signal produces `not_applicable` or `unknown`, never a pass. |
| It cannot inspect Partner Dashboard, legal agreements, listing media, production certificates, or reviewer access. | Keep these manual or hybrid and require user-provided evidence. |
| It has no update feed, signed release, or per-rule source version. | Re-verify official links before catalog publication and on a scheduled refresh in a future phase. |

## Recommended import strategy

Do not import the third-party repository as code, a dependency, a vendored dataset, or a canonical
catalog. Use it only to discover possible categories and review questions.

For each proposed SteadyFlow record:

1. Locate the corresponding official Shopify page and requirement identifier.
2. Independently write a concise description without copying third-party prose.
3. Set `officialSourceUrl`, `officialSourceTitle`, and `verifiedAt` from that official page.
4. Set `thirdPartyReference` only as traceability metadata, never as the rule source.
5. Leave `sourceVersion` unset unless Shopify itself supplies a stable version or dated release.
6. Route unverified, legal, Partner Dashboard, visual, or production-only claims to manual review.

## Update and staleness risks

- Shopify can change requirements without notice; a current commit is not a current policy guarantee.
- The same official page contains general and category-specific rules, so a broad page URL alone is
  insufficient without a stable requirement ID and source title.
- Shopify legal terms, Partner Dashboard fields, and implementation APIs can change independently.
- Category applicability depends on real product behavior, not directory names or a single config file.
- No automated refresh or runtime check is included in this phase.

## Explicit exclusions

This module excludes public OAuth, app installation, billing, payment processing, App Store
submission, Partner Dashboard access, listing publication, test-credential handling, production
certificate probes, storefront/theme mutation, account or store-domain collection, remediation,
and any claim of Shopify endorsement, certification, or guaranteed approval.

See [scope](SCOPE.md) for the product boundary and
[ADR](../../adr/XXX-shopify-app-readiness-source-model.md) for the source-model decision.
