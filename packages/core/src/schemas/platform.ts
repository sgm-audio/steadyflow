import { z } from 'zod';

/**
 * Supported e-commerce platforms.
 * Amazon SP-API is roadmap — included in enum so contracts are stable.
 */
export const Platform = z.enum(['shopify', 'etsy', 'amazon']);
export type Platform = z.infer<typeof Platform>;

export const PlatformUrl = z.object({
  platform: Platform,
  url: z.string().url().max(2048),
  /** Set when the URL is reachable only after auth (e.g., seller dashboard). */
  requiresAuth: z.boolean().default(false),
});
export type PlatformUrl = z.infer<typeof PlatformUrl>;
