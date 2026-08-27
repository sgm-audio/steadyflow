Task: Perform an adversarial review of the experimental Shopify App Store Readiness implementation.

Do not add major new features.

Review:

1. False-positive risks
2. False-negative risks
3. Outdated policy risks
4. Source-provenance failures
5. License and attribution risks
6. Secret leakage
7. Path traversal
8. Symlink traversal
9. Repository-size denial of service
10. Malformed TOML, JSON, YAML, Liquid, JavaScript, and TypeScript
11. Generated files and vendored dependencies
12. Misclassification of custom apps versus public apps
13. Incorrect applicability of billing or listing requirements
14. Unqualified compliance language
15. Missing official sources
16. Stale requirement handling
17. Authorization and organization isolation
18. Audit-log completeness
19. Report manipulation
20. Unsafe repository execution

Create:

- `docs/experimental/shopify-app-readiness/SECURITY_REVIEW.md`
- `docs/experimental/shopify-app-readiness/LIMITATIONS.md`

For every finding include:

- Severity
- Evidence
- Exploit or failure scenario
- Remediation
- Status

Fix all Critical and High issues within this phase where reasonably scoped.

Add regression tests for every fixed Critical or High issue.

Verification:

- Focused security tests
- Full package tests
- `pnpm check`
- Relevant repository security commands
- Confirm zero unresolved Critical or High issues