# App Readiness Report Review Template

Use to QC every generated readiness report before delivery. This is a manual operator review of the machine output — the engine's heuristics are a starting point, not the final word.

## Report metadata

- Report ID:
- App name / version:
- commit SHA reviewed:
- Generation timestamp:
- `reportHash` (recorded):
- Registry version / staleness status:

## Status summary

| Requirement | Engine status | Operator verdict | Notes |
|---|---|---|---|
| config-parsing | | | |
| api-scopes | | | |
| deprecated-api | | | |
| oauth-installation | | | |
| embedded-app (manual) | | | |
| theme-extension (manual) | | | |
| direct-mutations | | | |
| privacy-support-urls | | | |
| name-description | | | |
| dev-urls | | | |
| secret-detection | | | |
| webhook-identification | | | |
| external-deps | | | |

Operator verdict: ☐ agree with engine ☐ override (explain below).

## False-positive review

For each `fail` / `warning`, confirm it is real:

- [ ] Each `fail` is verified against the actual config/repo (not a heuristic artifact).
- [ ] Secret-detection matches are values, not benign key names.
- [ ] Deprecated-API matches are real API usage, not a substring in a comment/URL.
- [ ] `not_applicable` items are genuinely not applicable (data was absent), not a miss.

## False-negative review

- [ ] Any requirement the engine marked `pass` or `not_applicable` but where the repo shows a real gap? List:
- [ ] Manual items not skipped (full tier): `embedded-app`, `theme-extension`.
- [ ] Billing/subscription gaps noted as out-of-scope (not silently passed).

## Compliance-language check

- [ ] Report does not use "compliant" or imply approval.
- [ ] Report frames the result as a risk-reduction / readiness assessment.
- [ ] No promise of approval, review duration, or zero rejections.

## Provenance check

- [ ] Every requirement references an official Shopify source.
- [ ] Stale-requirement warnings surfaced, not suppressed.

## Integrity check

- [ ] Recompute `reportHash` from the report content and confirm it matches.
- [ ] Report has not been edited after generation.

## Sign-off

- Reviewer:
- Date:
- Delivered to client: ☐
