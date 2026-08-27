Task: Implement the manual-review workflow and evidence model for Shopify App Store readiness.

Objectives:

1. Support requirements that cannot be proven through static analysis.
2. Prevent automatic checks from being presented as complete compliance.
3. Produce a structured reviewer checklist.

Add models for:

- Manual review item
- Reviewer decision
- Evidence attachment reference
- Applicability decision
- Waiver or accepted-risk note
- Review timestamp
- Reviewer identity reference
- Requirement version reviewed

Manual-review areas should include:

- App functionality matches listing claims
- Installation starts through permitted Shopify surfaces
- OAuth flow behaviour
- Billing flow where applicable
- Demo credentials and reviewer access
- Screencast completeness
- Support responsiveness
- Privacy-policy accuracy
- Merchant data deletion handling
- UI quality and accessibility
- App performance
- Error handling
- Uninstall cleanup
- App listing assets and wording
- Shopify branding usage

Rules:

- A manual item cannot be marked passed without evidence or an explicit reviewer note.
- A stale requirement invalidates or downgrades prior review confidence.
- A changed repository commit invalidates code-sensitive evidence.
- Accepted risk cannot override a Shopify blocker; it can only document internal posture.
- Preserve the difference between:
  - observed behaviour
  - reviewer assertion
  - automated evidence
  - inferred result

Create:

- Strict schemas
- Persistence-compatible records
- Checklist generator
- Markdown checklist renderer
- Tests
- Experimental documentation

Do not build file-upload infrastructure. Use evidence references compatible with existing SteadyFlow storage patterns.

Verification:

- Generate a complete sample checklist.
- Confirm every manual requirement is represented.
- Run focused tests and `pnpm check`.