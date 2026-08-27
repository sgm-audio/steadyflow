# {{ NAME }} — Shopify app skeleton

Steadyflow-oriented Admin app starter. Prefer Shopify CLI for OAuth/session:

```bash
shopify app init   # or: shopify app dev inside this folder after linking
```

## Steadyflow integration

- Store Admin API token in Steadyflow BYOK as provider `shopify-admin`
- Reuse catalog audit via `@steadyflow/shopify-admin` / `@steadyflow/commerce`
- Keep webhook handlers idempotent; write audit_log for every external action

## Env

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=read_products,read_inventory,read_orders,write_products
HOST=
```
