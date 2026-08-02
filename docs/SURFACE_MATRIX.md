# SteadyFlow Surface Matrix

**Audited Commit:** `8bdeabc2312ee2e442126dcd92bf8b8e9886d728`  
**Audit Date:** 2026-08-02  
**Branch:** `review/scope-v1-merge` (merges the Shopify worker parity + doc-correction work into `main`)

This matrix documents every user-facing surface in SteadyFlow, its current status, and its v1.0.0 scope classification per the approved three-pillar scope decision.

## Legend

| Column | Description |
|--------|-------------|
| **Surface** | User-facing feature or interface |
| **Path** | File/route location |
| **Status** | `live` = functional, `stub` = placeholder, `roadmap` = not implemented |
| **v1 Scope** | `ship` = included in v0.x pilot, `experimental` = labeled as such, `remove` = not in scope |
| **Blockers** | Known issues preventing ship status |
| **Coverage** | Test coverage percentage (if measured) |

---

## Pillar 1: Shopify Revenue Audit Engine

| Surface | Path | Status | v1 Scope | Blockers | Coverage |
|---------|------|--------|----------|----------|----------|
| Shopify Admin catalogue audit | `packages/shopify-admin/` | live | ship | None | TBD |
| Storefront/theme inspection | `supabase/functions/workers-scrape/` | live | ship | Deno reimplements its own inline Shopify Admin GraphQL query + insight checks rather than importing `@steadyflow/shopify-admin`; behavior now matches Node's checks but the two implementations can drift independently | TBD |
| Product/collection completeness | `packages/core/src/contracts/` | live | ship | None | TBD |
| Metadata, alt-text, schema checks | `packages/core/src/audit/` | live | ship | None | TBD |
| App/script inventory | `packages/shopify-admin/` | live | ship | None | TBD |
| Printify unit-cost join | `packages/commerce/` | live | ship | Requires credentials | TBD |
| Manual audits | `apps/web/src/app/intents/` | live | ship | None | TBD |
| Weekly scheduled audits | `supabase/migrations/*weekly_audit*` | live | ship | Cron integration | TBD |
| Evidence-backed findings | `packages/core/src/contracts/procedures.ts` | live | ship | None | TBD |
| Impact/confidence/effort scoring | `packages/core/src/schemas/` | live | ship | None | TBD |
| Client-ready audit report | Not yet implemented | stub | ship | **PR 5 required** | N/A |
| BYOK: Shopify Admin | `packages/core/src/crypto/` | live | ship | None | TBD |
| BYOK: Printify | `packages/core/src/crypto/` | live | ship | None | TBD |
| BYOK: Firecrawl | `packages/core/src/crypto/` | live | ship | None | TBD |
| BYOK: Tavily | `packages/core/src/crypto/` | live | ship | None | TBD |
| BYOK: OpenAI-compatible LLM | `packages/llm/` | live | ship | None | TBD |

### Explicitly NOT in Pillar 1

| Surface | Path | Status | v1 Scope | Notes |
|---------|------|--------|----------|-------|
| Shopify order creation | `packages/commerce/` | stub | remove | Not needed for audits |
| Inventory mutation | `packages/commerce/` | stub | remove | Not needed for audits |
| Printify order submission | `packages/commerce/` | stub | remove | Not needed for audits |
| Fulfillment automation | N/A | roadmap | remove | Future capability |
| Amazon operations | `packages/commerce/src/adapters/amazon/` | stub | experimental | See Experimental Surfaces |
| WooCommerce operations | `packages/commerce/src/adapters/woocommerce/` | stub | experimental | See Experimental Surfaces |
| Alibaba operations | `packages/commerce/src/adapters/alibaba/` | stub | experimental | See Experimental Surfaces |
| Etsy operations | `packages/commerce/src/adapters/etsy/` | stub | experimental | See Experimental Surfaces |

---

## Pillar 2: Operator Dashboard and Delivery Workflow

| Surface | Path | Status | v1 Scope | Blockers | Coverage |
|---------|------|--------|----------|----------|----------|
| `/login` route | `apps/web/src/app/login/` | live | ship | None | TBD |
| `/dashboard` route | `apps/web/src/app/dashboard/` | live | ship | Real data integration | TBD |
| `/intents` route | `apps/web/src/app/intents/` | live | ship | None | TBD |
| `/intents/[id]` route | `apps/web/src/app/intents/[id]/` | live | ship | None | TBD |
| `/insights` route | `apps/web/src/app/insights/` | live | ship | Real data integration | TBD |
| `/audit` route | `apps/web/src/app/audit/` | live | ship | Real data integration | TBD |
| `/keys` route | `apps/web/src/app/keys/` | live | ship | None | TBD |
| `/keys/[provider]` route | `apps/web/src/app/keys/[provider]/` | live | ship | None | TBD |
| `/settings` route | `apps/web/src/app/settings/` | live | ship | None | TBD |
| Loading states | Various | partial | ship | Complete all routes | TBD |
| Empty states | Various | partial | ship | Complete all routes | TBD |
| Error states | Various | partial | ship | Complete all routes | TBD |
| Partial result states | Various | stub | ship | **PR 4 required** | N/A |
| Completed states | Various | live | ship | None | TBD |
| Cancelled states | Various | stub | ship | **PR 4 required** | N/A |
| Provider auth failure | Various | stub | ship | **PR 4 required** | N/A |

### Full Workflow Status

```
Login → Configure keys → Create intent → Worker processes → Findings appear → Audit events visible → Report generated
  ✓          ✓               ✓            ⚠️              ⚠️                ⚠️                  ✗
```

Key: ✓ = working, ⚠️ = partial/stub, ✗ = not implemented

### Explicitly Experimental (NOT in primary pitch)

| Surface | Path | Status | v1 Scope | Notes |
|---------|------|--------|----------|-------|
| Chrome extension | `apps/extension/` | stub | experimental | Label as experimental |
| Tauri desktop app | `apps/desktop/` | stub | experimental | Label as experimental |

---

## Pillar 3: Auditable Execution Layer

| Surface | Path | Status | v1 Scope | Blockers | Coverage |
|---------|------|--------|----------|----------|----------|
| 10 core procedures → Edge Functions | `supabase/functions/*/` | live | ship | Verify all 10 mapped | TBD |
| Zod validation at boundaries | `packages/core/src/contracts/` | live | ship | None | TBD |
| Shopify path parity (Node/Deno) | `apps/edge/` vs `supabase/functions/` | partial | ship | **PR 2 required** | TBD |
| Queue processing (production) | `supabase/functions/_shared/queue.ts` | live | ship | Verify pgmq integration | TBD |
| Rate limiting on provider calls | `supabase/functions/_shared/rateLimit.ts` | live | ship | Verify wired to all handlers | TBD |
| Audit events for external actions | `packages/core/src/audit/` | live | ship | Verify compliance scan | TBD |
| Secret redaction before hashing | `packages/core/src/crypto/` | live | ship | None | TBD |
| Provider-key envelope storage | `supabase/migrations/*keys_envelopes*` | live | ship | None | TBD |
| Dry-run/approval/apply/verify/fail states | `packages/core/src/schemas/intent.ts` | partial | ship | Verify all states work | TBD |
| Internal OpenAPI client (build artifact) | Not yet generated | stub | ship | **PR 4 required** | N/A |

### Explicitly NOT Public (Internal Only)

| Surface | Path | Status | v1 Scope | Notes |
|---------|------|--------|----------|-------|
| Public npm SDK | `packages/sdk/` | removed | remove | Keep internal only |
| Public contracts package | `packages/contracts/` | removed | remove | Keep internal only |
| Third-party developer platform | N/A | roadmap | remove | Future capability |
| Public API stability guarantees | N/A | N/A | remove | Not applicable to private pilot |

---

## Experimental Surfaces (Must Be Labeled)

| Surface | Path | Current Status | Documentation Status | Action Required |
|---------|------|----------------|---------------------|-----------------|
| Amazon SP-API | `packages/commerce/src/adapters/amazon/` | stub | Not labeled | Add @experimental tag |
| Amazon FBA/FBM | `packages/commerce/src/adapters/amazon/` | stub | Not labeled | Add @experimental tag |
| WooCommerce | `packages/commerce/src/adapters/woocommerce/` | stub | Not labeled | Add @experimental tag |
| Alibaba | `packages/commerce/src/adapters/alibaba/` | stub | Not labeled | Add @experimental tag |
| Etsy | `packages/commerce/src/adapters/etsy/` | stub | Not labeled | Add @experimental tag |
| Chrome extension | `apps/extension/` | stub | Not labeled | Add @experimental banner |
| Tauri desktop | `apps/desktop/` | stub | Not labeled | Add @experimental banner |
| Drizzle ORM | `packages/db/` | stub (types only) | Claims Drizzle | Correct documentation |
| Public npm SDK | N/A | removed | Still referenced | Remove from docs |
| Public contracts package | N/A | removed | Still referenced | Remove from docs |
| Printify order submission | `packages/commerce/` | stub | Not labeled | Add @experimental tag |
| Shopify order/inventory mutations | `packages/commerce/` | stub | Not labeled | Add @experimental tag |
| Competitor-enrichment depth | `supabase/functions/workers-enrich/` | live | Not scoped | Document limits |
| Groq-specific functionality | `packages/llm/src/adapters/groq/` | live | Over-specified | Generalize to OpenAI-compatible |
| NVIDIA NIM-specific functionality | `packages/llm/src/adapters/nvidia-nim/` | live | Over-specified | Generalize to OpenAI-compatible |

---

## Package Structure Corrections

| Claimed Path | Actual Path | Status | Action |
|--------------|-------------|--------|--------|
| `packages/crypto/` | `packages/core/src/crypto/` | Incorrect | Update all docs |
| `packages/sdk/` | Removed (was stub) | Incorrect | Remove from docs |
| `packages/contracts/` | Removed (was stub) | Incorrect | Remove from docs |
| `infra/supabase/` | `supabase/` (migrations/, functions/) | Incorrect | Update all docs |
| `packages/db/` (Drizzle ORM) | Generated types only | Incorrect | Correct documentation |
| `packages/llm/` (stub) | Implemented adapters | Incorrect | Update documentation |
| Rate limit source: unspecified | `supabase/functions/_shared/rateLimit.ts` | Incorrect | Update documentation |

---

## Security Documentation Corrections Required

| Claim | Current Location | Correction Required |
|-------|------------------|---------------------|
| "production-grade" | README.md line 3 | Replace with "private pilot" or "active development" |
| Hunter.io in BYOK | README.md, SECURITY.md, diagrams | Remove entirely (migration 20260712000004 dropped hunter) |
| "rate_limit_take not wired" | README.md line 27-28 | Correct: already called from provider handlers |
| "pg_partman partitioning" | SECURITY.md line 29 | Remove unsupported claim |
| "server never stores keys" | README.md line 130 | Replace with envelope encryption wording |

---

## Contract Procedures Status

All 10 core procedures from `packages/core/src/contracts/procedures.ts`:

| Procedure | Edge Function | Status | Notes |
|-----------|---------------|--------|-------|
| `intel.analyzeShop` | `supabase/functions/intel-analyze-shop/` | live | ✓ |
| `insights.list` | `supabase/functions/insights-list/` | live | ✓ |
| `audit.query` | `supabase/functions/audit-query/` | live | ✓ |
| `keys.set` | `supabase/functions/keys-set/` | live | ✓ |
| `keys.list` | `supabase/functions/keys-list/` | live | ✓ |
| `keys.test` | `supabase/functions/keys-test/` | live | ✓ |
| `org.llmConfig.get` | `supabase/functions/org-llm-config-get/` | live | ✓ |
| `org.llmConfig.set` | `supabase/functions/org-llm-config-set/` | live | ✓ |
| `intent.cancel` | `supabase/functions/intel-cancel/` | live | ✓ |
| `intent.list` | `supabase/functions/intel-list/` | live | ✓ |

---

## Implementation Priority Summary

### PR 0: Refresh Truth (Current Document)
- [x] Regenerate surface matrix from main
- [x] Record commit SHA
- [ ] Approve scope document

### PR 1: Remove False Claims
- [ ] Fix README.md ("production-grade" → "private pilot")
- [ ] Remove Hunter.io from all documentation
- [ ] Correct rate-limit documentation
- [ ] Remove nonexistent package paths from docs
- [ ] Document actual package structure
- [ ] Correct Drizzle claim in packages/db
- [ ] Correct packages/llm status
- [ ] Fix security documentation claims
- [ ] Label all experimental surfaces

### PR 2: Production Shopify Worker Parity
- [ ] Port Shopify Admin catalogue path to Deno scrape worker
- [ ] Ensure weekly audit invokes real Shopify audit
- [ ] Align Node and Deno result schemas
- [ ] Process all queues required by v1 audit workflow

### PR 3: End-to-End Audit Lifecycle
- [ ] Prove: intent created → queued → Shopify data retrieved → audit performed → insights persisted → intent completed → audit_log populated
- [ ] Add one full local Supabase integration test

### PR 4: Operator Dashboard Completion
- [ ] Replace stub calls with internal typed client
- [ ] Complete loading, empty, error, partial states
- [ ] Add Playwright test for primary workflow

### PR 5: Client Report Generation
- [ ] Generate client-facing report with executive summary, findings, evidence, severity, confidence, remediation recommendations, effort estimates, access requirements, fixed-price sprint recommendation

### PR 6: Making Madi Validation
- [ ] Run complete system against Making Madi
- [ ] Capture metrics (runtime, operator time, findings, acceptance rate, false positives, etc.)
- [ ] Convert results into flagship case study

---

## Versioning Roadmap

| Version | Target | Criteria |
|---------|--------|----------|
| v0.1.0 | Making Madi internal validation | This scope document approved |
| v0.2.0 | First paid customer | PR 1-5 complete |
| v0.5.0 | Repeatable private beta | Three paid audits delivered |
| v1.0.0 | Public release | All commercial + reliability gates met |

---

## Commercial Release Gates Checklist

- [ ] Hosted Shopify audits complete without manual database intervention
- [ ] Node and Deno produce equivalent Shopify findings
- [ ] Every provider call is rate-limited and audited
- [ ] No plaintext provider key is stored at rest
- [ ] An operator can generate a client report without editing database records
- [ ] Making Madi completes the full workflow
- [ ] No open Critical or High findings remain in BYOK, RLS, SSRF, or authorization paths
- [ ] Unauthorized mutation attempts fail safely
- [ ] Primary workflow has an automated integration test

---

## Business Validation Gates (Pre-OSS)

Do not begin public OSS and npm program until:

- [ ] Three paid Shopify audits delivered
- [ ] At least one paid implementation sprint completed
- [ ] At least one recurring monitoring customer
- [ ] Audit delivery requiring less than one hour of operator work
- [ ] Delivery gross margin above 70%
- [ ] Audit-to-sprint conversion target of at least 30%
- [ ] Documented list of features customers repeatedly request
