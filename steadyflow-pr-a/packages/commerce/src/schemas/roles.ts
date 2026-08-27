import { z } from 'zod';

/**
 * Commerce channel roles — orthogonal to BYOK `Provider` keys.
 * Selling = where customers buy; fulfillment = who ships; distributor = who supplies.
 */
export const SellingPlatformId = z.enum(['shopify', 'etsy', 'amazon', 'woocommerce']);
export type SellingPlatformId = z.infer<typeof SellingPlatformId>;

export const FulfillmentProviderId = z.enum(['printify', 'amazon-fba', 'amazon-fbm', 'manual']);
export type FulfillmentProviderId = z.infer<typeof FulfillmentProviderId>;

export const DistributorProviderId = z.enum(['alibaba', 'printify']);
export type DistributorProviderId = z.infer<typeof DistributorProviderId>;

export const CommerceExternalId = z.string().min(1).max(255);
export type CommerceExternalId = z.infer<typeof CommerceExternalId>;
