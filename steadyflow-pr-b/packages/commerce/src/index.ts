/**
 * @steadyflow/commerce
 *
 * Multi-platform commerce adapters + unified catalog/order/inventory schemas.
 */

export * from './schemas/index.js';
export * from './adapters/types.js';
export { createCommerceRegistry } from './adapters/registry.js';
export type { CommerceCredentials, CommerceRegistry, CreateCommerceRegistryOptions } from './adapters/registry.js';
export { createShopifySellingAdapter, ShopifySellingAdapter } from './adapters/shopify/selling.js';
export { createPrintifyFulfillmentAdapter, PrintifyFulfillmentAdapter } from './adapters/printify/fulfillment.js';
export { createAmazonSellingAdapter, AmazonSellingAdapter } from './adapters/amazon/selling.js';
export {
  AmazonFbaFulfillmentAdapter,
  AmazonFbmFulfillmentAdapter,
} from './adapters/amazon/fulfillment.js';
export { createAlibabaDistributorAdapter, AlibabaDistributorAdapter } from './adapters/alibaba/distributor.js';
export { createWooCommerceSellingAdapter, WooCommerceSellingAdapter } from './adapters/woocommerce/selling.js';
export { mapShopifyAuditToCatalog, mapShopifyProduct } from './mappers/shopify.js';
