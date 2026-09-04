/**
 * B3 — App fingerprint detection.
 *
 * Bridges the static-HTML analysis in `storefront.ts` (which already
 * recognizes ~30 common Shopify apps from their script hosts) into the
 * `app_fingerprints` table, so each audit permanently records what apps
 * are loading on a storefront and how often each one shows up across
 * audits.
 *
 * Sitemap-aware crawling is intentionally NOT part of this module — it's
 * a separate can of worms (sitemaps can be large, blocks, robots-disallowed,
 * etc.) and is tracked separately under B3 in TODO.md.
 */

import type { StorefrontAnalysis } from '../storefront.js';

/** Shape of a row in the `app_fingerprints` table — Insert variant. */
export interface AppFingerprint {
  shop_domain: string;
  app_handle: string;
  app_title: string;
  detection_source: 'theme_script' | 'storefront_meta' | 'sitemonitor' | 'manual';
  category: 'marketing' | 'reviews' | 'analytics' | 'support' | 'shipping' | 'inventory' | 'other';
  /** Number of distinct hostnames for this app on the storefront. */
  host_count: number;
  /** Total script tags served from this app's hosts. */
  script_count: number;
}

const APP_CATEGORY: Record<string, AppFingerprint['category']> = {
  Klaviyo: 'marketing',
  'Judge.me': 'reviews',
  Loox: 'reviews',
  Yotpo: 'reviews',
  Privy: 'marketing',
  Gorgias: 'support',
  'Smile.io': 'marketing',
  Recharge: 'shipping',
  Omnisend: 'marketing',
  'Stamped.io': 'reviews',
  AfterShip: 'shipping',
  Appstle: 'inventory',
  'Bold Commerce': 'other',
  Route: 'shipping',
  'Reviews.io': 'reviews',
  Trustpilot: 'reviews',
  Shogun: 'other',
  PageFly: 'other',
  GemPages: 'other',
  Zendesk: 'support',
  Tidio: 'support',
  Kustomer: 'support',
  Hotjar: 'analytics',
  'Microsoft Clarity': 'analytics',
  'Google Tag Manager': 'analytics',
  'Google Analytics': 'analytics',
  'Meta Pixel': 'analytics',
  'TikTok Pixel': 'analytics',
  'Snap Pixel': 'analytics',
};

/** Convert a `StorefrontAnalysis.appHosts` row into a stable app handle.
 *  Handles are always lowercase, hyphenated, ASCII — safe to use as a
 *  dedupe key in `app_fingerprints`. */
const handleFor = (appName: string): string =>
  appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const categoryFor = (appName: string): AppFingerprint['category'] =>
  APP_CATEGORY[appName] ?? 'other';

/**
 * Convert a `StorefrontAnalysis` into one `AppFingerprint` per detected app.
 * Apps are deduplicated by title (the same app may load from multiple hosts —
 * `klaviyo.com` and `static.klaviyo.com` collapse to a single "Klaviyo" row).
 * Returns an empty array when the analysis found no apps, which is the common
 * case for very small or freshly built Shopify stores.
 */
export const extractAppFingerprints = (
  analysis: StorefrontAnalysis,
  shopDomain: string,
): AppFingerprint[] => {
  const byTitle = new Map<string, { host_count: number; script_count: number }>();
  for (const h of analysis.appHosts) {
    if (!h.appName) continue;
    const entry = byTitle.get(h.appName) ?? { host_count: 0, script_count: 0 };
    entry.host_count += 1;
    entry.script_count += h.count;
    byTitle.set(h.appName, entry);
  }
  const out: AppFingerprint[] = [];
  for (const [appName, { host_count, script_count }] of byTitle) {
    out.push({
      shop_domain: shopDomain,
      app_handle: handleFor(appName),
      app_title: appName,
      detection_source: 'theme_script',
      category: categoryFor(appName),
      host_count,
      script_count,
    });
  }
  return out;
};
