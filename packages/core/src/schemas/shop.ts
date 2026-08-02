import { z } from 'zod';

export const ShopId = z.string().uuid().brand<'ShopId'>();
export type ShopId = z.infer<typeof ShopId>;

export const ShopHandle = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9._-]+$/, 'handle must be URL-safe')
  .brand<'ShopHandle'>();
export type ShopHandle = z.infer<typeof ShopHandle>;

export const ShopifyShop = z
  .object({
    platform: z.literal('shopify'),
    id: ShopId,
    handle: ShopHandle,
    domain: z.string().max(255),
    name: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    productCount: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ShopifyShop = z.infer<typeof ShopifyShop>;

export const EtsyShop = z
  .object({
    platform: z.literal('etsy'),
    id: ShopId,
    handle: ShopHandle,
    name: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    listingCount: z.number().int().nonnegative().optional(),
    location: z.string().max(255).optional(),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type EtsyShop = z.infer<typeof EtsyShop>;

export const Shop = z.discriminatedUnion('platform', [ShopifyShop, EtsyShop]);
export type Shop = z.infer<typeof Shop>;

/**
 * Type guards for narrowing Shop by platform.
 * Amazon is roadmap-only and not yet implemented — calling `PlatformGuard.amazon()` throws.
 */
export const PlatformGuard = {
  shopify: (s: Shop): s is ShopifyShop => s.platform === 'shopify',
  etsy: (s: Shop): s is EtsyShop => s.platform === 'etsy',
  amazon: (_s: Shop): never => {
    throw new Error('Amazon platform is roadmap-only; not yet implemented');
  },
} as const;
