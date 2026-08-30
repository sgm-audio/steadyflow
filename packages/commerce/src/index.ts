/**
 * @steadyflow/commerce — v0.x live surface
 *
 * Shopify + Printify only. Other platforms (Amazon, Alibaba, WooCommerce, Etsy)
 * are experimental and live in `adapters/*` as stubs — not exported from the
 * package index to keep the v0.x bundle trim. Import them directly if needed:
 * `import { createAmazonSellingAdapter } from '@steadyflow/commerce/src/adapters/amazon/selling.js'`
 */

export {
  PrintifyFulfillmentAdapter,
  createPrintifyFulfillmentAdapter,
} from './adapters/printify/fulfillment.js';
export { createCommerceRegistry } from './adapters/registry.js';
export type {
  CommerceCredentials,
  CommerceRegistry,
  CreateCommerceRegistryOptions,
} from './adapters/registry.js';
export { ShopifySellingAdapter, createShopifySellingAdapter } from './adapters/shopify/selling.js';
export * from './adapters/types.js';
export { mapShopifyAuditToCatalog, mapShopifyProduct } from './mappers/shopify.js';
export * from './schemas/index.js';
