# Revenue Leak Audit — Offer-to-System Capability Map

Maps the deliverables of `offer-1-revenue-leak-audit-onepager.html` to SteadyFlow's
production capabilities, records what was implemented to close the gaps, and flags
what remains a human/manual step (and therefore must not be over-promised).

## Deliverable → Capability status

| Offer deliverable | System capability | Status |
|---|---|---|
| "200+ point technical + conversion teardown" | Shopify Admin + Printify catalog audit (19 product flags) + homepage SEO signals + AI-agent readiness + first-sale math + channel gap + creator playbook + **speed/friction + app-bloat** (added) | ✅ Engine runs end-to-end; ~40 discrete checks (the "200+" figure is marketing copy — do not repeat it verbatim) |
| "Leak List ranked by estimated revenue impact ($)" | `buildLeakList` + `totalEstimatedImpact` (added) | ✅ Ranked by `$`/yr, deterministic + documented assumptions |
| "Speed & friction: Core Web Vitals, third-party scripts" | `analyzeStorefrontHtml` (added) | ⚠️ Static proxy for CWV (render-blocking JS, undimensioned images, preload, third-party hosts) — **not** real Lighthouse metrics |
| "Checkout & cart teardown" | Not implemented | ❌ Out of scope without a test order / headless checkout session; must be delivered as manual review |
| "App bloat report" | `analyzeStorefrontHtml` known-app host detection (added) | ⚠️ Detects vendor-hosted app scripts; Shopify-CDN-proxied embeds are not distinguishable from theme assets |
| "Video walkthrough" | Report data (findings + leak list) | Human deliverable — operator records it from the generated report |
| "30-minute findings call" | Report data | Human deliverable |
| "$10k/year recoverable, or refund" | `totalEstimatedImpact` (added) | ⚠️ Estimate (no analytics in read-only scope); guarantee depends on the operator's manual review to confirm |
| "Read the code before you pay [GITHUB URL]" | Repo is public-able | External — set the URL before publishing the one-pager |
| "Read-only access" | Shopify Admin (read-only GraphQL) + Printify via BYOK | ✅ Already supported |

## What was implemented (this phase)

1. **`packages/shopify-admin/src/audit/impact.ts`** — deterministic revenue-impact
   estimator: `deriveLeakContext` (AOV from catalog, documented order-volume default),
   `aggregateFlags`, `buildLeakList` (ranked `$`/yr), `totalEstimatedImpact`. Every value
   carries a `basis` string documenting the assumption, so the "$10k guarantee" and
   "ranked by dollars" promise are backed by a reproducible model, not vibes.

2. **`packages/shopify-admin/src/storefront.ts`** — `analyzeStorefrontHtml`: extracts and
   classifies `<script src>` hosts (first-party / third-party / known Shopify app vendors),
   counts render-blocking scripts, undimensioned images, and preload; emits LCP/CLS risk
   proxies and a 0-100 friction score. Backs "third-party scripts" and "app bloat".

3. **`apps/edge/src/workers.ts` `analyzeShopifyCatalog`** — now (a) annotates every flag
   finding with its `~$/yr` estimate, (b) inserts a ranked "Revenue Leak List" summary
   insight, and (c) runs the storefront analyzer and inserts "App bloat" and
   "Speed & friction" insights. All flows through the existing report pipeline.

Unit tests: `impact.test.ts` (7) and `storefront.test.ts` (6) in `packages/shopify-admin`.

## What remains manual / must not be automated yet

- **Checkout/cart teardown** — Shopify checkout is server-rendered and gated; a real
  teardown requires a test order or operator-driven browser session. Until a headless
  checkout flow is built, this deliverable is human.
- **True Core Web Vitals** — LCP/CLS/INP need Lighthouse/Playwright with mobile
  throttling. The current analyzer is a static proxy (flags likely culprits, not
  measured values). A real measurement pass is a follow-up (`scrape.playwright` is
  already in the audit-action enum).
- **Video walkthrough + findings call** — operator deliverables, unchanged.
- **Dollar estimates** — computed without analytics (read-only Shopify + Printify only);
  the operator should sanity-check the top items before quoting the guarantee.

## Production readiness check

- [x] Audit engine (catalog + SEO + margin + first-sale) runs end-to-end.
- [x] Findings are ranked by estimated `$` impact with documented basis.
- [x] Speed/friction + app-bloat analysis produces findings.
- [x] Read-only Shopify Admin + Printify via BYOK; org isolation + RLS + audit log.
- [x] **Deno impact parity** — `supabase/functions/workers-scrape/` now imports the
  vendored `@steadyflow/shopify-admin` bundle (`runCatalogAudit`, `buildLeakList`,
  `totalEstimatedImpact`, `computeAuditScore`), so the deployed edge path produces the
  same ranked Leak List as the Node worker. (Closed as PR-2 in `docs/SURFACE_MATRIX.md`.)
- [ ] **Deno storefront/SEO/AI parity** — the Deno worker still runs only the catalog
  + leak-list path. Homepage SEO signals, `analyzeStorefrontHtml` (speed/friction +
  app bloat), AI-readiness score, first-sale math, channel-gap/creator playbook, LLM
  synthesis, and `reports` persistence (`first_sale_plan`) are produced only by the
  Node worker (`apps/edge/src/workers.ts`), not by the deployed Deno worker.
- [ ] Checkout teardown + real CWV measurement (explicit manual follow-ups).
