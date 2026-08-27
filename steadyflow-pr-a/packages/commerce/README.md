# `@steadyflow/commerce`

Unified product / catalog / order / inventory abstractions so selling platforms,
fulfillment providers, and distributors plug in without rewriting core.

## Roles

| Role | Platforms | Status |
|------|-----------|--------|
| Selling | Shopify, Amazon, WooCommerce | Shopify live; Amazon/Woo stubs |
| Fulfillment | Printify, Amazon FBA/FBM | Printify live; FBA/FBM stubs |
| Distributor | Alibaba, Printify (cost catalog) | Alibaba stub; Printify live via `@steadyflow/shopify-admin` |

## Quick use

```ts
import { createCommerceRegistry, CommerceConfigSchema } from '@steadyflow/commerce';

const config = CommerceConfigSchema.parse({
  orgId: '...',
  selling: [{ platform: 'shopify', storeUrl: 'https://shop.myshopify.com', enabled: true }],
  fulfillment: [{ provider: 'printify', enabled: true }],
  distributors: [{ provider: 'alibaba', enabled: false }],
});

const registry = createCommerceRegistry({
  config,
  credentials: {
    'shopify-admin': process.env.SHOPIFY_ADMIN_TOKEN!,
    printify: process.env.PRINTIFY_TOKEN,
  },
});

const catalog = await registry.selling.get('shopify')?.listCatalog();
```

## DX tooling

Scaffold Shopify themes/apps and WordPress plugins/themes from the monorepo root:

```bash
pnpm --filter @steadyflow/devkit scaffold shopify-theme ./my-theme
pnpm --filter @steadyflow/devkit scaffold shopify-app ./my-app
pnpm --filter @steadyflow/devkit scaffold wordpress-plugin ./my-plugin
pnpm --filter @steadyflow/devkit scaffold wordpress-theme ./my-theme
```
