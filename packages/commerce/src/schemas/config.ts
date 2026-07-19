import { z } from 'zod';
import {
  DistributorProviderId,
  FulfillmentProviderId,
  SellingPlatformId,
} from './roles.js';

export const SellingChannelConfig = z
  .object({
    platform: SellingPlatformId,
    enabled: z.boolean().default(true),
    /** Storefront / seller URL (Shopify shop, Amazon seller central storefront, etc.). */
    storeUrl: z.string().url().max(2048).optional(),
    /** Marketplace region / marketplace id (e.g. Amazon NA, EU). */
    region: z.string().max(64).optional(),
    /** Preferred fulfillment routing for orders from this channel. */
    defaultFulfillment: FulfillmentProviderId.optional(),
  })
  .strict();
export type SellingChannelConfig = z.infer<typeof SellingChannelConfig>;

export const FulfillmentChannelConfig = z
  .object({
    provider: FulfillmentProviderId,
    enabled: z.boolean().default(true),
    /** Printify shop id, FBA warehouse code, etc. */
    externalShopId: z.string().max(128).optional(),
  })
  .strict();
export type FulfillmentChannelConfig = z.infer<typeof FulfillmentChannelConfig>;

export const DistributorChannelConfig = z
  .object({
    provider: DistributorProviderId,
    enabled: z.boolean().default(false),
    /** Preferred currency for cost quotes. */
    preferredCurrency: z.string().length(3).optional(),
  })
  .strict();
export type DistributorChannelConfig = z.infer<typeof DistributorChannelConfig>;

/**
 * Org-level multi-platform commerce configuration.
 * Validated at the boundary before constructing adapters.
 */
export const CommerceConfig = z
  .object({
    orgId: z.string().uuid(),
    primarySelling: SellingPlatformId.default('shopify'),
    selling: z.array(SellingChannelConfig).min(1).max(10),
    fulfillment: z.array(FulfillmentChannelConfig).max(10).default([]),
    distributors: z.array(DistributorChannelConfig).max(10).default([]),
    /** When true, inventory sync pushes from fulfillment → selling channels. */
    syncInventory: z.boolean().default(true),
    /** When true, paid orders auto-handoff to default fulfillment. */
    autoFulfill: z.boolean().default(false),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const platforms = new Set(cfg.selling.map((s) => s.platform));
    if (!platforms.has(cfg.primarySelling)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `primarySelling '${cfg.primarySelling}' must appear in selling[]`,
        path: ['primarySelling'],
      });
    }
  });
export type CommerceConfig = z.infer<typeof CommerceConfig>;

/** Alias matching README examples. */
export const CommerceConfigSchema = CommerceConfig;
