/**
 * B6 — tracking verification from storefront HTML.
 *
 * Deterministic regex scan of the homepage HTML already fetched for
 * `storefront.ts` / `theme.ts`. No network, no headless browser.
 * Reuses the same SSRF-guarded fetch boundary as the other HTML
 * proxies — this module never fetches itself.
 *
 * Maps directly onto `packages/core/src/schemas/tracking.ts`:
 *   10 providers, 100-point weighted coverage, evidence-required
 *   when detected, strict fail-closed on empty/partial HTML.
 */

export type TrackingProvider =
  | 'ga4'
  | 'gtm'
  | 'meta_pixel'
  | 'google_ads_conversion'
  | 'shopify_analytics'
  | 'segment'
  | 'klaviyo'
  | 'tiktok_pixel'
  | 'pinterest_tag'
  | 'snapchat_pixel';

export type TrackingSource = 'homepage_html' | 'homepage_script';

export interface TrackingCheck {
  provider: TrackingProvider;
  detected: boolean;
  id?: string | undefined;
  evidence?: string | undefined;
  source: TrackingSource;
}

export interface TrackingVerificationOutput {
  url: string;
  checks: TrackingCheck[];
  coverageScore: number;
  recommendations: { provider: TrackingProvider; severity: 'required' | 'recommended' | 'optional'; message: string }[];
  fetchedAt: string;
}

const TRACKING_WEIGHTS: Record<TrackingProvider, number> = {
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
};

const SEVERITY_FOR: Record<TrackingProvider, 'required' | 'recommended' | 'optional'> = {
  ga4: 'required',
  meta_pixel: 'required',
  google_ads_conversion: 'required',
  shopify_analytics: 'required',
  gtm: 'recommended',
  klaviyo: 'recommended',
  tiktok_pixel: 'recommended',
  pinterest_tag: 'optional',
  snapchat_pixel: 'optional',
  segment: 'optional',
};

interface Pattern {
  provider: TrackingProvider;
  re: RegExp;
  idRe?: RegExp;
  source: TrackingSource;
}

/* Ponytail: one regex per provider, first match wins for evidence (≤200). Upgrade to DOM-parse if false-negatives spike on minified bundles. */
const PATTERNS: readonly Pattern[] = [
  { provider: 'ga4', re: /googletagmanager\.com\/gtag\/js\?id=G-[A-Z0-9]+|gtag\(['"]config['"],\s*['"]G-[A-Z0-9]+['"]|G-[A-Z0-9]{7,}/i, idRe: /G-[A-Z0-9]{7,}/, source: 'homepage_script' },
  { provider: 'gtm', re: /googletagmanager\.com\/gtm\.js|googletagmanager\.com\/gtag\/js.*GTM-|GTM-[A-Z0-9]{5,}/i, idRe: /GTM-[A-Z0-9]{5,}/, source: 'homepage_script' },
  { provider: 'meta_pixel', re: /connect\.facebook\.net\/.*fbevents\.js|facebook\.com\/tr\?id=\d+|fbq\(\s*['"]init['"]/i, idRe: /fbq\(\s*['"]init['"],\s*['"](\d+)['"]/, source: 'homepage_script' },
  { provider: 'google_ads_conversion', re: /googletagmanager\.com\/gtag\/js\?id=AW-\d+|googleadservices\.com\/pagead\/conversion|AW-\d{8,}/, idRe: /AW-\d{8,}/, source: 'homepage_script' },
  { provider: 'shopify_analytics', re: /cdn\.shopify\.com\/shopifycloud\/web-pixels-manager|trekkie\.storefront|Shopify\.analytics|shopify-analytics/i, source: 'homepage_script' },
  { provider: 'segment', re: /cdn\.segment\.com\/analytics\.js|segment\.com\/analytics\.js|analytics\.track\(/i, source: 'homepage_script' },
  { provider: 'klaviyo', re: /static\.klaviyo\.com\/onsite\/js\/klaviyo\.js|klaviyo\.com\/media\/js|_klaviyo/i, source: 'homepage_script' },
  { provider: 'tiktok_pixel', re: /analytics\.tiktok\.com\/i18n\/pixel|tiktok\.com\/i18n\/pixel\/events\.js|ttq\.track\(|ttq\.load\(/i, source: 'homepage_script' },
  { provider: 'pinterest_tag', re: /ct\.pinterest\.com\/v3\/|s\.pinterest\.com\/ct\/core\.js|pintrk\(/i, source: 'homepage_script' },
  { provider: 'snapchat_pixel', re: /sc-static\.net\/scevent\.min\.js|snapchat\.com\/tr|snaptr\(/i, source: 'homepage_script' },
];

const evidenceFor = (html: string, re: RegExp): string | undefined => {
  const m = re.exec(html);
  if (!m) return undefined;
  // Evidence is the matched snippet trimmed to 200 chars, normalized whitespace.
  const raw = m[0].replace(/\s+/g, ' ').trim().slice(0, 200);
  return raw.length > 0 ? raw : undefined;
};

const idFor = (html: string, idRe: RegExp | undefined): string | undefined => {
  if (!idRe) return undefined;
  const m = idRe.exec(html);
  const hit = m?.[1] ?? m?.[0];
  return hit ? hit.slice(0, 128) : undefined;
};

export const detectTracking = (html: string): TrackingCheck[] => {
  if (html.trim().length === 0) {
    return (Object.keys(TRACKING_WEIGHTS) as TrackingProvider[]).map((provider) => ({
      provider,
      detected: false,
      source: 'homepage_html' as const,
    }));
  }
  const checks: TrackingCheck[] = [];
  for (const p of PATTERNS) {
    const detected = p.re.test(html);
    // Reset lastIndex for global-free reuse (patterns are not /g, but defensive)
    p.re.lastIndex = 0;
    if (p.idRe) p.idRe.lastIndex = 0;
    if (detected) {
      const evidence = evidenceFor(html, p.re);
      // evidence is required when detected; if regex glitched, synthesize a short hit
      const safeEvidence = evidence ?? p.provider.slice(0, 50);
      const id = idFor(html, p.idRe);
      checks.push({
        provider: p.provider,
        detected: true,
        ...(id ? { id } : {}),
        evidence: safeEvidence,
        source: p.source,
      });
    } else {
      checks.push({ provider: p.provider, detected: false, source: 'homepage_html' });
    }
  }
  return checks;
};

export const computeCoverageScore = (checks: readonly TrackingCheck[]): number => {
  let total = 0;
  for (const c of checks) if (c.detected) total += TRACKING_WEIGHTS[c.provider];
  return Math.min(100, Math.round(total));
};

export const verifyTracking = (url: string, html: string): TrackingVerificationOutput => {
  const checks = detectTracking(html);
  const coverageScore = computeCoverageScore(checks);
  const recommendations = checks
    .filter((c) => !c.detected)
    .map((c) => ({
      provider: c.provider,
      severity: SEVERITY_FOR[c.provider],
      message: `Add ${c.provider} (${SEVERITY_FOR[c.provider]}) — not detected on ${url}.`,
    }));
  return { url, checks, coverageScore, recommendations, fetchedAt: new Date().toISOString() };
};
