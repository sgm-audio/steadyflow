Task: Build the Shopify App Store Readiness report generator.

Input:

- Canonical requirement registry
- Static check results
- Manual review results
- Target app metadata
- Repository commit SHA
- Scan timestamp

Output formats:

- Structured JSON
- Client-ready Markdown
- HTML if the existing SteadyFlow reporting system supports it cleanly

The report must contain:

1. Executive summary
2. Experimental disclaimer
3. Target repository and commit
4. Registry version and verification date
5. Overall readiness status:
   - not_ready
   - needs_review
   - conditionally_ready
   - ready_for_submission_review
6. Blocker count
7. Warning count
8. Manual-review count
9. Unknown count
10. Findings grouped by category
11. Evidence
12. Recommended remediation
13. Official Shopify source for each finding
14. Stale-requirement warnings
15. Limitations
16. Submission preparation checklist

Do not calculate a misleading percentage score as the primary result.

The report may include a secondary weighted indicator, but it must not imply Shopify approval probability.

Decision logic:

- Any unresolved blocker prevents `ready_for_submission_review`.
- Any stale blocker-level requirement prevents a ready status.
- Unknown applicability for blocker requirements prevents a ready status.
- Manual-review requirements must be explicitly completed or marked not applicable with rationale.
- The report must never use the word “compliant” as an unconditional final conclusion.
- Prefer “no issue detected by this check” over “compliant.”

Add tests for:

- Clear readiness case
- Blocked case
- Stale registry
- Missing manual evidence
- Contradictory evidence
- Unknown applicability
- Empty scan

Verification:

- Generate a fixture report.
- Confirm every finding links to an official Shopify source.
- Run tests, typecheck, lint, and `pnpm check`.