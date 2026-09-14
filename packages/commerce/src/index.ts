/**
 * @steadyflow/commerce — v0.x live surface
 *
 * Shopify + Printify + Amazon. Amazon is backed by SP-API (LWA + SigV4) in
 * `adapters/amazon/` — catalog, orders, FBA inventory, inventory push.
 * Remaining platforms (Alibaba, WooCommerce, Etsy) are experimental stubs.
 */

export {
  AmazonFbaFulfillmentAdapter,
  AmazonFbmFulfillmentAdapter,
} from './adapters/amazon/fulfillment.js';
export {
  AmazonSellingAdapter,
  createAmazonSellingAdapter,
  type AmazonPushInventoryResult,
  type AmazonSellingAdapterOptions,
} from './adapters/amazon/selling.js';
export {
  AmazonSpApiCredentialsSchema,
  parseAmazonSpApiCredentials,
  type SpApiCredentials,
} from './adapters/amazon/credential.js';
export {
  mapAmazonCatalogItem,
  mapAmazonInventorySummary,
  mapAmazonOrder,
  mapAmazonOrderItems,
} from './adapters/amazon/mappers.js';
export { SpApiClient, SP_API_REGIONS } from './adapters/amazon/spapi/client.js';
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
