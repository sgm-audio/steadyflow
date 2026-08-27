Task: Create the design baseline for an experimental Shopify App Store Readiness module. Do not implement runtime checks yet.

Objectives:

1. Inspect `creativehubspace/shopify-app-store-requirements`.
2. Determine:
   - Repository license
   - Update recency
   - Data format
   - Requirement categories
   - Whether content is copied, summarized, generated, or linked
   - Which portions can be reused legally and technically
3. Compare it against current official Shopify App Store requirements.
4. Identify outdated, unsupported, ambiguous, or missing requirements.
5. Design how SteadyFlow should represent requirements without making the third-party repository authoritative.

Create:

- `docs/experimental/shopify-app-readiness/RESEARCH.md`
- `docs/experimental/shopify-app-readiness/SCOPE.md`
- `docs/adr/XXX-shopify-app-readiness-source-model.md`

The research document must contain:

- Third-party repository assessment
- License and attribution implications
- Official Shopify source hierarchy
- Recommended import strategy
- Update and staleness risks
- Explicit list of functionality excluded from this module

The scope document must define:

- Intended user
- Intended output
- Supported application types
- Automatic vs manual checks
- Non-goals
- Security boundaries
- What “experimental” means
- Conditions required before this becomes production-supported

Design a requirement record with at least:

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
};
```

You may revise this type after examining existing SteadyFlow models.

Do not:

- Copy the full third-party dataset
- Add runtime dependencies
- Add automated checks
- Add API routes
- Change the approved SteadyFlow v1 scope
- Claim Shopify endorsement

Verification:

- Validate all internal documentation links.
- Confirm every proposed source is an official Shopify domain.
- Run documentation or repository checks that apply to changed files.
- Report any licensing uncertainty as a blocker rather than guessing.