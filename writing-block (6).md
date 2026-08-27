Task: Integrate the experimental Shopify App Store Readiness module into SteadyFlow without changing the merchant-audit v1 scope.

Choose the smallest appropriate integration.

Preferred integration:

- Experimental intent type or internal CLI command
- Existing intent and audit infrastructure
- Existing report persistence
- Existing audit event model
- No primary-navigation promotion
- No public marketing claims

Required flow:

```text
Target Shopify app repository
→ static scan
→ canonical requirement matching
→ manual-review checklist
→ readiness report
→ audit event
```

Add:

1. Internal command or experimental endpoint to initiate a scan.
2. Input validation.
3. Authorization using existing organization boundaries.
4. Audit events for:
   - scan started
   - scan completed
   - scan failed
   - manual review updated
   - report generated
5. Report retrieval.
6. Explicit experimental labels in API and UI.
7. Feature flag disabled by default.
8. Documentation explaining how to enable it in development.

Do not:

- Add it to the primary Shopify merchant audit flow.
- Enable it by default.
- advertise it on the main dashboard.
- Send reports automatically.
- Clone arbitrary private repositories without an approved existing repository-access mechanism.
- accept unauthenticated Git URLs.
- execute code from scanned repositories.

If repository access is not already safely supported, implement fixture/local-path operation only and document remote repository access as a future requirement.

Verification:

- Full integration test from scan request to stored report.
- Authorization-negative test.
- Path traversal and symlink tests.
- Audit-event assertion.
- `pnpm check`.