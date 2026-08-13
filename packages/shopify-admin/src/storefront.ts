/**
 * Static storefront performance / friction / app-bloat analysis.
 *
 * Deterministic HTML analysis (no headless browser). Used to back the "Speed &
 * friction analysis" and "App bloat report" deliverables of the Revenue Leak
 * Audit: which third-party scripts load, which are render-blocking, which known
 * Shopify apps are present, and whether images are dimensioned (CLS risk).
 *
 * This is a static proxy for Core Web Vitals — it flags the most common LCP/CLS
 * culprits, but does NOT run Lighthouse or measure real metrics.
 */

export interface HostSummary {
  host: string;
  count: number;
  /** Set when the host matches a known Shopify app vendor. */
  appName?: string;
}

export interface StorefrontAnalysis {
  totalScripts: number;
  thirdPartyHosts: HostSummary[];
  appHosts: HostSummary[];
  renderBlockingScripts: number;
  imagesWithoutDimensions: number;
  totalImages: number;
  hasPreload: boolean;
  /** Proxy for LCP: render-blocking JS / missing preload / heavy hero images. */
  lcpRisk: 'high' | 'medium' | 'low';
  /** Proxy for CLS: undimensioned images / injected third-party widgets. */
  clsRisk: 'high' | 'medium' | 'low';
  /** 0-100 friction score; higher = more to fix. */
  inefficiencyScore: number;
}

/** Shopify-owned origins treated as first-party (theme assets, checkout). */
const SHOPIFY_FIRST_PARTY = new Set([
  'cdn.shopify.com',
  'cdn.shopifycdn.net',
  'shop.app',
  'checkout.shopify.com',
  'pay.google.com',
  'payments.google.com',
]);

/**
 * Host substring → vendor name for common Shopify apps. App embeds served from
 * the app vendor's own domain are the unambiguous "app bloat" signal (embeds
 * proxied through cdn.shopify.com are not distinguishable from theme assets).
 */
const KNOWN_APP_HOSTS: readonly { match: string; app: string }[] = [
  { match: 'klaviyo.com', app: 'Klaviyo' },
  { match: 'judge.me', app: 'Judge.me' },
  { match: 'loox.io', app: 'Loox' },
  { match: 'yotpo.com', app: 'Yotpo' },
  { match: 'privy.com', app: 'Privy' },
  { match: 'gorgias.chat', app: 'Gorgias' },
  { match: 'smile.io', app: 'Smile.io' },
  { match: 'rechargecdn.com', app: 'Recharge' },
  { match: 'omnisnippet1.com', app: 'Omnisend' },
  { match: 'stamped.io', app: 'Stamped.io' },
  { match: 'aftership.com', app: 'AfterShip' },
  { match: 'appstle.com', app: 'Appstle' },
  { match: 'boldcommerce', app: 'Bold Commerce' },
  { match: 'route.com', app: 'Route' },
  { match: 'reviews.io', app: 'Reviews.io' },
  { match: 'trustpilot.com', app: 'Trustpilot' },
  { match: 'shogun.com', app: 'Shogun' },
  { match: 'pagefly.io', app: 'PageFly' },
  { match: 'gemproxies', app: 'GemPages' },
  { match: 'zendesk.com', app: 'Zendesk' },
  { match: 'tidio.co', app: 'Tidio' },
  { match: 'kustomerapp.com', app: 'Kustomer' },
  { match: 'hotjar.com', app: 'Hotjar' },
  { match: 'clarity.ms', app: 'Microsoft Clarity' },
  { match: 'gtm.js', app: 'Google Tag Manager' },
  { match: 'googletagmanager.com', app: 'Google Tag Manager' },
  { match: 'google-analytics.com', app: 'Google Analytics' },
  { match: 'facebook.net', app: 'Meta Pixel' },
  { match: 'tiktok.com', app: 'TikTok Pixel' },
  { match: 'snapchat.com', app: 'Snap Pixel' },
];

const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const IMG_RE = /<img\b[^>]*>/gi;
const HAS_WIDTH = /\bwidth\s*=/i;
const HAS_HEIGHT = /\bheight\s*=/i;
const PRELOAD_RE = /<link\b[^>]*\brel=["']preload["'][^>]*>/i;
const HEAD_RE = /<head\b[^>]*>([\s\S]*?)<\/head>/i;

const extractHost = (src: string, storeHost: string): string => {
  let url = src.trim();
  if (url.startsWith('//')) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) return storeHost; // relative → first party
  try {
    return new URL(url).hostname;
  } catch {
    return storeHost;
  }
};

const classifyHost = (host: string, storeHost: string): { isFirstParty: boolean; appName?: string } => {
  if (host === storeHost || SHOPIFY_FIRST_PARTY.has(host)) {
    return { isFirstParty: true };
  }
  const app = KNOWN_APP_HOSTS.find((a) => host.includes(a.match) || a.match.includes(host));
  if (app) return { isFirstParty: false, appName: app.app };
  return { isFirstParty: false };
};

export const analyzeStorefrontHtml = (html: string, storeHost: string): StorefrontAnalysis => {
  const head = HEAD_RE.exec(html)?.[1] ?? '';

  const scriptHosts = new Map<string, { count: number; appName?: string | undefined; renderBlocking: number }>();
  let totalScripts = 0;

  for (const match of html.matchAll(SCRIPT_SRC_RE)) {
    const tag = match[0];
    const src = match[1];
    if (!tag || !src) continue;
    totalScripts += 1;
    const host = extractHost(src, storeHost);
    const { isFirstParty, appName } = classifyHost(host, storeHost);
    const inHead = head.includes(tag);
    const isAsync = /\basync\b/i.test(tag);
    const isDefer = /\bdefer\b/i.test(tag);
    const isModule = /\btype=["']module["']/i.test(tag);
    const renderBlocking = inHead && !isAsync && !isDefer && !isModule;

    const entry = scriptHosts.get(host) ?? { count: 0, appName, renderBlocking: 0 };
    entry.count += 1;
    if (renderBlocking) entry.renderBlocking += 1;
    if (appName) entry.appName = appName;
    scriptHosts.set(host, entry);
    void isFirstParty;
  }

  const thirdPartyHosts: HostSummary[] = [];
  const appHosts: HostSummary[] = [];
  let renderBlockingScripts = 0;
  for (const [host, e] of scriptHosts) {
    renderBlockingScripts += e.renderBlocking;
    if (e.appName) {
      appHosts.push({ host, count: e.count, appName: e.appName });
    } else if (host !== storeHost && !SHOPIFY_FIRST_PARTY.has(host)) {
      thirdPartyHosts.push({ host, count: e.count });
    }
  }

  let totalImages = 0;
  let imagesWithoutDimensions = 0;
  for (const match of html.matchAll(IMG_RE)) {
    const tag = match[0];
    if (!tag) continue;
    totalImages += 1;
    if (!HAS_WIDTH.test(tag) || !HAS_HEIGHT.test(tag)) imagesWithoutDimensions += 1;
  }

  const hasPreload = PRELOAD_RE.test(head);

  const lcpRisk =
    renderBlockingScripts >= 3 || !hasPreload ? 'high' :
    renderBlockingScripts >= 1 ? 'medium' : 'low';

  const clsRisk =
    totalImages > 0 && imagesWithoutDimensions / totalImages >= 0.5 ? 'high' :
    imagesWithoutDimensions > 0 || thirdPartyHosts.length >= 3 ? 'medium' : 'low';

  // 0-100: reward a clean storefront, penalize scripts, undimensioned images, and widget count.
  const inefficiencyScore = Math.min(
    100,
    totalScripts * 4 + thirdPartyHosts.length * 5 + appHosts.length * 4 +
    renderBlockingScripts * 3 + imagesWithoutDimensions * 2 + (hasPreload ? 0 : 8),
  );

  return {
    totalScripts,
    thirdPartyHosts,
    appHosts,
    renderBlockingScripts,
    imagesWithoutDimensions,
    totalImages,
    hasPreload,
    lcpRisk,
    clsRisk,
    inefficiencyScore,
  };
};
