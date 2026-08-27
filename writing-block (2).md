Task: Implement the canonical Shopify App Store requirement registry for the experimental readiness module.

Use the approved Phase 0 research and ADR.

Requirements:

1. Create a package or module location consistent with the existing repository architecture. Prefer extending an existing checks or core package over creating a new package without justification.
2. Add strict Zod schemas for:
   - Requirement records
   - Requirement categories
   - Validation modes
   - Applicability
   - Requirement-source metadata
3. Create an initial curated registry based only on requirements verified against official Shopify documentation.
4. Do not copy large passages from Shopify or the third-party repository. Store concise paraphrases and official URLs.
5. Record `verifiedAt` for every entry.
6. Include a registry version and schema version.
7. Reject:
   - Duplicate IDs
   - Missing official sources
   - Non-Shopify canonical domains
   - Invalid dates
   - Empty applicability
   - Automatic checks with no associated check identifier
8. Add a staleness helper that marks requirements for review after a configurable interval.
9. Add a machine-readable export suitable for later reporting.
10. Keep the module explicitly experimental in exports and documentation.

Suggested structure, adapt to repository conventions:

```text
packages/core/src/experimental/shopify-app-readiness/
├── schema.ts
├── registry.ts
├── validation.ts
├── staleness.ts
├── index.ts
└── *.test.ts
```

Initial categories should prioritize:

- Authentication and OAuth
- API usage and scopes
- Embedded application behaviour
- Theme app extensions
- Installation and uninstall behaviour
- Billing applicability
- Privacy and data handling
- Performance
- Listing accuracy
- Review and submission evidence

Do not implement source-code checks in this phase.

Tests must cover:

- Valid registry
- Duplicate IDs
- Invalid source domains
- Invalid dates
- Stale records
- Unsupported enum values
- Unknown object keys
- Automatic validation without a check ID

Verification:

- Run package tests.
- Run typecheck and lint.
- Run `pnpm check`.
- Report the number of requirements by category and validation mode.