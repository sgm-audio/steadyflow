# Audit Pipeline — Operations Runbook

> Scope: `apps/edge` workers + `supabase/functions/workers-*`. Supabase is the
> single source of truth; `audit_log` is append-only and is the primary
> observability surface.

## Signals that matter

| Signal | Source | Healthy | Investigate |
|---|---|---|---|
| Audit success rate | `audit_log` where `action LIKE 'analyze.%'` | >95% `outcome=success` | <95% for a rolling 24h window |
| Worker queue depth | `pgmq` / `intents` with `status='queued'` | 0–5 queued | >5 queued for >15 min |
| Intent time-to-complete | `intents.updated_at - created_at` | <10 min | >30 min or stuck `queued` |
| LLM failure mode counts | `audit_log` `outcome=error` + provider in (`deepseek`, `openai`) | 0 `/llm_*` | any `llm_malformed_json` / `llm_refusal` spike |
| Provider 429s | `audit_log` `outcome='rate_limited'` | rare, self-healing | sustained 429s (quota) |
| Deno/Node parity | periodic re-audit of same shop, Node vs Deno | identical findings | any drift (see below) |

## Failure modes and responses

### 1. Audit stuck in `queued`
- **Symptom:** `intents` rows sitting in `queued` >30 min.
- **Check:** worker logs for unhandled rejections; `pgmq` queue health.
- **Response:** confirm `workers-analyze`/`workers-scrape` are running (`pnpm --filter @steadyflow/edge worker:loop` locally; edge function logs in Supabase dashboard). Drain one intent manually to isolate.

### 2. LLM failure spike (malformed / empty / refusal)
- **Symptom:** `audit_log` `outcome=error` climbing; named codes `llm_malformed_json`, `llm_empty_response`, `llm_refusal`.
- **Cause:** model regression, prompt drift, or a refusal-triggering input (scraped page contains policy-violating text).
- **Response:** check the provider's model version; if refusal, the scraped content is the trigger — inspect `input_hash` source, not the raw body. Degrade to the deterministic catalog audit (it does not depend on the LLM) while the LLM path is fixed.

### 3. Shopify / Printify 429
- **Symptom:** `outcome='rate_limited'`.
- **Response:** nothing to do for a transient burst (backoff is built in). If sustained, the org has hit quota — surface to the operator, do not retry harder.

### 4. Deno/Node finding drift
- **Symptom:** same shop audited via Node worker and Deno scrape worker yields different flags/leak list.
- **Root cause (known):** `supabase/functions/workers-scrape` re-implements the audit inline instead of importing `@steadyflow/shopify-admin`.
- **Response:** this is a correctness bug, not a tuning issue — the fix is the Deno-import parity work (tracked in TODO.md as S1). Until landed, treat the Node worker output as authoritative.

### 5. `totalEstimatedImpact` looks wrong (no $-ranked leak list)
- **Symptom:** leak list empty or ranked oddly in the client report.
- **Check:** `deriveLeakContext` `source` field — `assumed` means no `read_orders` scope, so AOV/volume are defaults; `real` means sales data was used. Both are documented in each `LeakItem.basis` string.
- **Response:** confirm read-only scopes; the `$` figures are estimates for ranking, not accounting truth — do not quote them as measured revenue.

## Post-incident checklist

1. Reconstruct from `audit_log`: `input_hash`, `outcome`, `duration_ms`, `provider`, `action`.
2. Confirm no plaintext key was written (envelope-only; `redactSecrets` runs before hashing).
3. Note the incident against the relevant `TODO.md` item (S1 parity, S6 recurring diff, B1/B2/B3).
