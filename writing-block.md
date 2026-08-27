You are working in the SteadyFlow repository.

SteadyFlow is a private Shopify revenue-audit and remediation platform. The current commercial v1 scope is already approved. Do not expand that scope.

Your task is to add an experimental Shopify App Store readiness capability using the third-party repository `creativehubspace/shopify-app-store-requirements` only as a research and implementation accelerator.

The official Shopify documentation is always authoritative. Never treat the third-party repository as the canonical policy source.

Read before changing anything:

- `AGENTS.md`
- `README.md`
- `docs/SURFACE_MATRIX.md`
- The approved v1 scope document
- Relevant code under `packages/core`
- Relevant checks, reports, contracts, and audit infrastructure
- Current Shopify App Store requirements from official Shopify documentation
- `creativehubspace/shopify-app-store-requirements`

Product constraints:

1. Do not change the approved three-pillar SteadyFlow v1 scope.
2. Keep Shopify App Store readiness experimental.
3. Do not add public OAuth, billing, app installation, App Store submission, or multi-tenant app functionality unless explicitly requested in the current task.
4. Do not copy third-party code or text without checking its license and attribution requirements.
5. Do not make compliance guarantees.
6. Every requirement must link to an official Shopify source.
7. Every requirement must record when it was last verified.
8. Separate automatically testable requirements from manual review requirements.
9. Do not scrape or reproduce large amounts of Shopify documentation.
10. Do not introduce secrets, tokens, client identifiers, store domains, or personal data.

Engineering constraints:

- TypeScript strict mode.
- Use `z.strictObject` at external and persisted boundaries.
- Reuse existing SteadyFlow contracts, findings, audit, scoring, and reporting primitives.
- Avoid duplicate Shopify-specific models when an existing generic model can be extended safely.
- External calls must follow the repository’s audit and redaction rules.
- Checks must be deterministic where possible.
- All mutation-capable functionality must remain disabled for this feature.
- No automated remediation is included in the initial readiness module.
- Fail closed on malformed configuration.
- Distinguish `pass`, `fail`, `warning`, `manual_review`, `not_applicable`, and `unknown`.
- Preserve source provenance and evidence.

Working method:

1. Inspect the repository and identify existing patterns before designing new abstractions.
2. State assumptions in the implementation notes.
3. Make the smallest coherent change that completes the current phase.
4. Add tests for behaviour and failure paths.
5. Run all relevant verification commands.
6. Do not claim completion unless the commands pass.
7. Do not silently weaken lint, type, security, or coverage requirements.
8. Do not modify unrelated files.
9. Do not begin the next phase.
10. Finish with:
   - Files changed
   - Architectural decisions
   - Verification commands and results
   - Known limitations
   - Recommended next phase

Use one branch and one pull request for this phase.