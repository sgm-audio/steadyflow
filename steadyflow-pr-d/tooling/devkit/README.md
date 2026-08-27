# Steadyflow Devkit

Scaffold Shopify and WordPress projects that plug into `@steadyflow/commerce`.

```bash
pnpm --filter @steadyflow/devkit scaffold shopify-theme ./themes/my-theme
pnpm --filter @steadyflow/devkit scaffold shopify-app ./apps/my-shopify-app
pnpm --filter @steadyflow/devkit scaffold wordpress-plugin ./wp/plugins/sf-bridge
pnpm --filter @steadyflow/devkit scaffold wordpress-theme ./wp/themes/sf-store
```

Or via the bin after install:

```bash
pnpm exec steadyflow-dev scaffold shopify-theme ./themes/my-theme --name=making-madi
```
