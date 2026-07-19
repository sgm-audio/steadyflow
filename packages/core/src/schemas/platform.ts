import { z } from 'zod';

/**
 * Supported selling-surface platforms for shop analysis intents.
 * WooCommerce covered via WordPress DX + `@steadyflow/commerce` adapters.
 * Amazon SP-API is roadmap-ready in `@steadyflow/commerce` (stub).
 */
export const Platform = z.enum(['shopify', 'etsy', 'amazon', 'woocommerce']);
export type Platform = z.infer<typeof Platform>;

export const PlatformUrl = z.object({
  platform: Platform,
  url: z.string().url().max(2048),
  /** Set when the URL is reachable only after auth (e.g., seller dashboard). */
  requiresAuth: z.boolean().default(false),
});
export type PlatformUrl = z.infer<typeof PlatformUrl>;
