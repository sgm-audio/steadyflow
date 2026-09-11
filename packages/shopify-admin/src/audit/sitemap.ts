/**
 * B3 leftover — sitemap-aware crawl.
 *
 * Homepage fingerprinting only sees apps that load globally.
 * Some apps inject only on product/collection templates, so we
 * also sample the storefront's sitemap for a few representative
 * product/collection URLs and re-run the storefront analyzer.
 *
 * Caps and guards (see PROMPTS.md P2):
 *   - SSRF: callers MUST `assertPublicHttpUrl` / `assertSafeFetchUrl`
 *     before invoking `crawlSitemapUrls` and before fetching each
 *     returned URL. This module is SSRF-agnostic so it stays
 *     runtime-neutral (Node `lookup` vs Deno `resolveDns`).
 *   - Cap: first 20 product/collection URLs only.
 *   - Per-fetch timeout: 5s (sitemap.xml, robots.txt, child sitemaps).
 *   - Fail-closed on huge/blocked sitemaps: return [] rather than throw.
 *   - Skip robots-disallowed URLs.
 *
 * No new dependency — XML parsed with a regex (sitemaps are a flat
 * `<loc>` list, not a namespace-sensitive document).
 */

export const MAX_SITEMAP_BYTES = 1_000_000;
export const MAX_CRAWL_TARGETS = 20;
export const SITEMAP_TIMEOUT_MS = 5_000;

export interface CrawlOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Pre-fetched robots.txt (avoids a second fetch when the caller already has it). */
  robotsText?: string | null;
}

const withTimeout = (ms: number, fetchImpl: typeof fetch): typeof fetch =>
  ((input: string | URL, init?: RequestInit) =>
    Promise.race([
      fetchImpl(input as unknown as string, init),
      new Promise<Response>((_, reject) =>
        setTimeout(() => {
          reject(new Error(`Fetch timed out after ${ms}ms`));
        }, ms),
      ),
    ])) as typeof fetch;

const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

export const extractSitemapUrls = (xml: string): string[] => {
  const out: string[] = [];
  for (const m of xml.matchAll(LOC_RE)) {
    const url = m[1]?.trim();
    if (url) out.push(url);
  }
  return out;
};

export const isSitemapIndex = (xml: string): boolean => xml.includes('<sitemap>');

const isProductOrCollectionUrl = (url: string): boolean =>
  url.includes('/products/') || url.includes('/collections/');

export const parseRobotsDisallows = (robotsText: string): string[] => {
  const disallows: string[] = [];
  let appliesToWildcard = false;
  for (const rawLine of robotsText.split('\n')) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (/^user-agent:\s*\*/i.test(line)) {
      appliesToWildcard = true;
      continue;
    }
    if (/^user-agent:/i.test(line)) {
      appliesToWildcard = false;
      continue;
    }
    if (!appliesToWildcard) continue;
    const m = /^disallow:\s*(\S*)/i.exec(line);
    if (m) {
      const path = m[1]?.trim() ?? '';
      if (path) disallows.push(path);
    }
  }
  return disallows;
};

export const isAllowedByRobots = (url: string, disallows: string[]): boolean => {
  if (disallows.length === 0) return true;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  for (const d of disallows) {
    if (pathname.startsWith(d)) return false;
  }
  return true;
};

const sameHost = (url: string, storeHost: string): boolean => {
  try {
    return new URL(url).hostname === storeHost;
  } catch {
    return false;
  }
};

export const selectCrawlTargets = (
  urls: string[],
  storeHost: string,
  robotsText: string | null,
): string[] => {
  const disallows = robotsText ? parseRobotsDisallows(robotsText) : [];
  const out: string[] = [];
  for (const u of urls) {
    if (!isProductOrCollectionUrl(u)) continue;
    if (!sameHost(u, storeHost)) continue;
    if (!isAllowedByRobots(u, disallows)) continue;
    out.push(u);
    if (out.length >= MAX_CRAWL_TARGETS) break;
  }
  return out;
};

const fetchText = async (
  url: string,
  f: typeof fetch,
  maxBytes: number,
): Promise<string | null> => {
  const res = await f(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' },
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (text.length > maxBytes) return null;
  return text;
};

/**
 * Fetch /sitemap.xml and return up to 20 product/collection URLs
 * eligible for crawling. Never throws — returns [] on any failure,
 * oversized sitemap, or robots-blocked result.
 */
export const crawlSitemapUrls = async (
  storeUrl: string,
  opts: CrawlOptions = {},
): Promise<string[]> => {
  const timeoutMs = opts.timeoutMs ?? SITEMAP_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const f = withTimeout(timeoutMs, fetchImpl);

  let storeHost: string;
  try {
    storeHost = new URL(storeUrl).hostname;
  } catch {
    return [];
  }
  const base = storeUrl.replace(/\/+$/, '');
  const sitemapUrl = `${base}/sitemap.xml`;

  try {
    const xml = await fetchText(sitemapUrl, f, MAX_SITEMAP_BYTES);
    if (!xml) return [];
    // Huge sitemap guard — already size-checked, but also cap loc count
    // before we start fetching child sitemaps.
    if (xml.length > MAX_SITEMAP_BYTES) return [];

    let candidateUrls: string[] = [];

    if (isSitemapIndex(xml)) {
      const childLocs = extractSitemapUrls(xml);
      if (childLocs.length === 0) return [];
      // Shopify serves e.g. /sitemap_products_1.xml etc. Only follow
      // same-host child sitemaps; cap child fetches to bound work.
      const sameHostChildren = childLocs.filter((u) => sameHost(u, storeHost)).slice(0, 3);
      for (const childUrl of sameHostChildren) {
        // Fail-closed per child — skip rather than abort everything.
        try {
          const childXml = await fetchText(childUrl, f, MAX_SITEMAP_BYTES);
          if (!childXml) continue;
          candidateUrls.push(...extractSitemapUrls(childXml));
          // Early exit once we have more than enough to fill the cap after filtering
          if (candidateUrls.length >= 100) break;
        } catch {
          continue;
        }
      }
      // If no child succeeded but the index itself had product URLs inline
      // (degenerate), fall back to index locs.
      if (candidateUrls.length === 0) candidateUrls = childLocs;
    } else {
      candidateUrls = extractSitemapUrls(xml);
    }

    // Guard against pathologically large urlsets without parsing the whole thing twice
    if (candidateUrls.length > 5000) return [];

    let robotsText: string | null = opts.robotsText ?? null;
    if (robotsText === null) {
      try {
        const robotsUrl = `${base}/robots.txt`;
        const rt = await fetchText(robotsUrl, f, 100_000);
        robotsText = rt;
      } catch {
        robotsText = null;
      }
    }

    return selectCrawlTargets(candidateUrls, storeHost, robotsText);
  } catch {
    return [];
  }
};
