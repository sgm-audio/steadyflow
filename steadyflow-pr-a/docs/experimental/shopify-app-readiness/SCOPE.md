# Shopify App Store Readiness: scope

**Status:** experimental design baseline
**Related research:** [RESEARCH.md](RESEARCH.md)

## Intended user

An internal SteadyFlow operator or product engineer preparing a future Shopify integration for a
human-led App Store readiness review. It is not for merchants, reviewers, or public self-service
submission.

## Intended output

A dated, evidence-oriented readiness brief containing:

- independently sourced requirements relevant to the declared application type;
- an explicit automatic, manual, or hybrid validation mode per requirement;
- evidence pointers and unknowns;
- a clear statement that the result is experimental and not a compliance guarantee.

The initial output is a design artifact only. It does not execute checks, access Shopify, or change
application state.

## Supported application types

The initial catalog design supports classification only for a future public embedded Shopify app
using Shopify Admin APIs. It recognizes these future applicability labels:

- `embedded_public_app`
- `online_store_extension`
- `product_sourcing`

All other Shopify App Store categories—payments, payment facilitators, purchase options, checkout
customization, sales channels, post-purchase, mobile-app builders, donation, blockchain, POS, and
Sidekick—are out of scope for evaluation. They may be recorded as `not_applicable` only with
documented product evidence; otherwise they remain `unknown`.

## Requirement record

The initial representation is intentionally a type design, not a runtime schema or persisted model.
It adds explicit source and evidence semantics to the proposed shape:

```ts
type ShopifyAppRequirement = {
  id: string;
  title: string;
  description: string;
  category:
    | "authentication"
    | "authorization"
    | "api"
    | "billing"
    | "functionality"
    | "performance"
    | "security"
    | "privacy"
    | "installation"
    | "theme"
    | "listing"
    | "submission"
    | "other";
  severity: "blocker" | "warning";
  validationMode: "automatic" | "manual" | "hybrid";
  applicability: string[];
  officialSourceUrl: string;
  officialSourceTitle: string;
  verifiedAt: string;
  sourceVersion?: string;
  thirdPartyReference?: string;
  notes?: string;
  evidenceExpectations: string[];
};
```

`officialSourceUrl` must be HTTPS on an official Shopify domain. `verifiedAt` is the date the
SteadyFlow maintainer checked that source. `thirdPartyReference` is optional provenance for research
only and cannot be used to evaluate, override, or refresh a requirement.

## Automatic vs manual checks

Future automatic checks may only inspect non-secret, user-supplied artifacts deterministically—for
example, detecting a legacy Admin REST endpoint in a declared code artifact or confirming an
official source URL format. They must emit evidence and an `unknown` result when the artifact is
absent or ambiguous.

Manual checks cover legal terms, Partner standing, listing claims and media, reviewer credentials,
production TLS validity, privacy disclosures, app behavior, and anything requiring Shopify access
or human judgment. Hybrid checks can collect static evidence but require human confirmation before
any conclusion.

No checks are implemented in this phase.

## Non-goals

- Compliance certification, legal advice, or an App Store approval prediction.
- OAuth, installation, billing, subscription, payment, sales-channel, or submission functionality.
- Access to Partner Dashboard, stores, credentials, tokens, client IDs, or personal data.
- Runtime repository scanning, deployment probes, web crawling, or remediation.
- Expanding the approved three-pillar SteadyFlow v1 scope in [SURFACE_MATRIX.md](../../SURFACE_MATRIX.md).

## Security boundaries

- No secrets, store domains, client identifiers, customer data, or reviewer credentials are accepted
  or persisted by this module.
- The design has no network calls and no mutation-capable functionality.
- Any future external collector must be separately approved, read-only by default, strictly validate
  inputs, redact audit input, and create an audit event under SteadyFlow's existing audit rules.
- Evidence references must avoid embedding sensitive values; a file path, stable identifier, or
  redacted observation is sufficient.

## Meaning of experimental

Experimental means the source model is not a production-supported feature, has no stability or
coverage promise, is not exposed to customers, and may be changed or removed without a compatibility
commitment. It does not imply Shopify endorsement or readiness for App Store submission.

## Conditions for production support

Before this module can be production-supported, SteadyFlow must have:

1. A maintainer-owned official-source refresh process with change review and dated provenance.
2. A reviewed requirement catalog covering supported application types and explicit category gates.
3. Strict persisted and external-boundary schemas, evidence retention rules, and audit coverage.
4. Deterministic checks with negative-path tests, manual-review workflows, and no false-pass behavior.
5. Security review for any Shopify or deployment access, including secret handling and least privilege.
6. Product approval that the capability belongs in scope; this phase does not change v1.
