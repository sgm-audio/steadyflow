Task: Implement the first static Shopify App Store readiness checks.

Build checks that inspect a Shopify app repository without modifying it.

Initial checks:

1. App configuration files exist and parse successfully.
2. Requested API scopes can be extracted.
3. Potentially excessive or suspicious scopes are flagged for manual review.
4. Deprecated REST Admin API usage is detected where reliable.
5. OAuth or Shopify-managed installation entry points are identified.
6. Embedded-app configuration is detected.
7. Theme modifications are checked for theme app extension usage.
8. Direct theme mutation patterns are flagged.
9. Privacy-policy and support URLs are present where configuration exposes them.
10. App name, description, and feature claims can be extracted for later listing review.
11. Hardcoded development URLs are detected.
12. Secrets or credential-like values in tracked configuration are flagged without printing their values.
13. Required webhook topics or privacy webhooks are identified where applicable.
14. External network dependencies are inventoried for performance and privacy review.

Define a normalized result:

```ts
type ReadinessCheckResult = {
  requirementId: string;
  checkId: string;
  status:
    | "pass"
    | "fail"
    | "warning"
    | "manual_review"
    | "not_applicable"
    | "unknown";
  summary: string;
  evidence: Array<{
    path?: string;
    line?: number;
    kind: string;
    value?: string;
  }>;
  remediation?: string;
  confidence: "high" | "medium" | "low";
};
```

Security constraints:

- Never include detected secret values in output.
- Redact URLs containing credentials or query tokens.
- Do not execute repository code.
- Do not install dependencies from the target app.
- Do not make external network requests during static analysis.
- Defend against symlink traversal and path traversal.
- Limit file size and total scan volume.
- Ignore generated and dependency directories by default.

Architecture:

- Separate file discovery, parsing, rules, and result formatting.
- Each automatic rule must map to a canonical requirement ID.
- Unsupported or ambiguous cases must return `manual_review` or `unknown`, not false passes.
- Rules must be individually testable.
- Use fixtures representing:
  - Compliant app
  - Legacy app
  - Theme-mutating app
  - Missing configuration
  - Malicious or malformed repository content

Do not add a dashboard yet.

Verification:

- Run focused tests.
- Run security-related tests.
- Run typecheck and lint.
- Run `pnpm check`.
- Produce a sample JSON result from a fixture.