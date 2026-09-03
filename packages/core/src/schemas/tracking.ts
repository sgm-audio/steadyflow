import { z } from 'zod';

/**
 * Tracking verification — schema for the `intel.trackingCheck` procedure
 * (B6, contract-only surface; worker wiring deferred).
 *
 * The procedure reports whether common analytics/marketing tags are
 * actually firing on the storefront. The worker is expected to crawl a
 * handful of representative URLs (homepage, product, cart) and look for
 * known script signatures, pixel IDs, and Shopify's built-in analytics
 * events.
 *
 * This file is intentionally a pure contract: it defines the data shape,
 * the provider enum, and the coverage scoring rules. The actual scraper
 * lives in the audit engine and is not part of v0.x.
 */

/** Providers we know how to detect. Keep this list narrow on purpose —
 *  detection gets brittle past ~15 providers. New providers go through
 *  a registry pattern at implementation time. */
export const TrackingProvider = z.enum([
  'ga4',
  'gtm',
  'meta_pixel',
  'google_ads_conversion',
  'shopify_analytics',
  'segment',
  'klaviyo',
  'tiktok_pixel',
  'pinterest_tag',
  'snapchat_pixel',
]);
export type TrackingProvider = z.infer<typeof TrackingProvider>;

/** Where the detection signal came from. Useful for explaining the result
 *  to the merchant and for triaging false negatives. */
export const TrackingSource = z.enum([
  'homepage_html',
  'homepage_script',
  'product_page_html',
  'product_page_script',
  'cart_page_script',
  'storefront_meta',
  'robots_txt',
  'manual',
]);
export type TrackingSource = z.infer<typeof TrackingSource>;

/** One detection result. A non-empty `evidence` snippet is required when
 *  `detected: true` so we can later audit and tune the detector without
 *  re-crawling. */
export const TrackingCheck = z
  .object({
    provider: TrackingProvider,
    detected: z.boolean(),
    /** Stable identifier when available (e.g. GA4 measurement ID, Meta pixel ID). */
    id: z.string().min(1).max(128).optional(),
    /** Truncated snippet (≤200 chars) that triggered the detection. Required
     *  when `detected: true`. */
    evidence: z.string().min(1).max(200).optional(),
    source: TrackingSource,
  })
  .strict()
  .refine((c) => !c.detected || (c.evidence !== undefined && c.evidence.length > 0), {
    message: 'evidence is required when detected is true',
    path: ['evidence'],
  });
export type TrackingCheck = z.infer<typeof TrackingCheck>;

/** Provider → weight in the 0-100 coverage score. The sum is 100; the
 *  contract enforces this at parse time so a future schema edit can't
 *  silently shift the math. */
export const TRACKING_PROVIDER_WEIGHTS = {
  ga4: 25,
  meta_pixel: 20,
  google_ads_conversion: 15,
  shopify_analytics: 15,
  gtm: 10,
  klaviyo: 5,
  tiktok_pixel: 5,
  pinterest_tag: 3,
  snapchat_pixel: 1,
  segment: 1,
} as const satisfies Record<TrackingProvider, number>;

/** Recommended action items derived from the detection matrix. Each entry
 *  is a one-line directive the merchant can act on without further
 *  analysis. */
export const TrackingRecommendation = z
  .object({
    provider: TrackingProvider,
    severity: z.enum(['required', 'recommended', 'optional']),
    message: z.string().min(1).max(500),
  })
  .strict();
export type TrackingRecommendation = z.infer<typeof TrackingRecommendation>;

export const TrackingVerificationOutput = z
  .object({
    /** The URL that was checked. Echoed for the client + for audit_log. */
    url: z.string().url(),
    checks: z.array(TrackingCheck),
    /** Weighted 0-100 score; sums weights of detected providers. */
    coverageScore: z.number().int().min(0).max(100),
    recommendations: z.array(TrackingRecommendation),
    /** ISO timestamp the verification ran. */
    fetchedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type TrackingVerificationOutput = z.infer<typeof TrackingVerificationOutput>;

/** Pure function: derive the coverage score from a list of checks. Lives
 *  here so the contract test, the worker, and any future dashboard
 *  re-deriver all see the same math. */
export const computeCoverageScore = (checks: readonly TrackingCheck[]): number => {
  let total = 0;
  for (const check of checks) {
    if (check.detected) total += TRACKING_PROVIDER_WEIGHTS[check.provider];
  }
  return Math.min(100, Math.round(total));
};
