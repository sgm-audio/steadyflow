/**
 * SSRF guard for outbound fetch boundaries.
 *
 * The audit engine fetches merchant-controlled content (storefront HTML,
 * sitemaps, crawled pages). Any URL an attacker or a compromised merchant can
 * influence becomes an SSRF vector. This module is the single choke point:
 * every outbound fetch MUST pass `assertSafeFetchUrl` before issuing the
 * request.
 *
 * Guard strategy (defense in depth):
 *   1. Reject anything that is not a parseable http(s) URL.
 *   2. Reject reserved hostnames (localhost, .local, .internal, metadata).
 *   3. Reject literal IPs in private / reserved / loopback / link-local ranges.
 *   4. Require the hostname to match an explicit allowlist (exact or subdomain).
 *
 * Limitation (documented): this guard validates the URL and hostname string,
 * not the DNS-resolved address. A full DNS-rebinding defense must re-check the
 * resolved address immediately before connect (needs a runtime resolver) —
 * tracked as a follow-up, not silently omitted.
 */

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`[core] SSRF blocked: ${reason}`);
    this.name = 'SsrfBlockedError';
  }
}

export interface SafeFetchUrl {
  /** Canonical URL string to fetch (parsed, normalized). */
  url: string;
  /** Lowercased hostname that passed the allowlist. */
  hostname: string;
}

/**
 * Hostnames that must never be fetched, regardless of allowlist.
 * Covers localhost variants, mDNS (.local), and cloud-metadata endpoints.
 */
const RESERVED_HOSTS: readonly string[] = [
  'localhost',
  'metadata.google.internal',
  'instance-data',
];

const isReservedHost = (hostname: string): boolean => {
  if (RESERVED_HOSTS.includes(hostname)) return true;
  if (hostname.endsWith('.localhost')) return true;
  if (hostname.endsWith('.local')) return true;
  if (hostname.endsWith('.internal')) return true;
  return false;
};

/**
 * True when the hostname is a literal IPv4 address in a private, loopback,
 * link-local, carrier-grade NAT, benchmark, multicast, or reserved range.
 */
export const isBlockedIpv4 = (host: string): boolean => {
  const octets = host.split('.');
  if (octets.length !== 4) return false;
  const parts = octets.map((o) => {
    if (!/^\d{1,3}$/.test(o)) return Number.NaN;
    const n = Number(o);
    return n >= 0 && n <= 255 ? n : Number.NaN;
  });
  if (parts.some(Number.isNaN)) return false;
  const [a, b] = parts as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
};

/** True when the hostname is a literal IPv6 address in a loopback/ULA/link-local range. */
export const isBlockedIpv6 = (host: string): boolean => {
  const lower = host.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('::ffff:127')) return true; // IPv4-mapped loopback
  return false;
};

const isIpLiteral = (host: string): boolean =>
  host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

const isBlockedIpLiteral = (host: string): boolean => {
  if (host.includes(':')) return isBlockedIpv6(host.replace(/^\[|\]$/g, ''));
  return isBlockedIpv4(host);
};

const hostMatches = (hostname: string, allowed: string): boolean =>
  hostname === allowed || hostname.endsWith(`.${allowed}`);

/**
 * Validate that a URL is safe to fetch from the audit backend.
 *
 * @param rawUrl  The candidate URL (from a sitemap, link, or stored value).
 * @param allowedHosts  Explicit allowlist of permitted hostnames. Subdomains
 *                      of an allowed host are permitted.
 * @returns normalized URL + hostname, or throws `SsrfBlockedError`.
 */
export const assertSafeFetchUrl = (
  rawUrl: string,
  allowedHosts: readonly string[],
): SafeFetchUrl => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('unparseable URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`scheme ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (isReservedHost(hostname)) {
    throw new SsrfBlockedError(`reserved hostname ${hostname}`);
  }
  if (isIpLiteral(hostname) && isBlockedIpLiteral(hostname)) {
    throw new SsrfBlockedError(`blocked IP literal ${hostname}`);
  }
  if (!allowedHosts.some((h) => hostMatches(hostname, h))) {
    throw new SsrfBlockedError(`host ${hostname} not in allowlist`);
  }

  return { url: parsed.toString(), hostname };
};

/**
 * Default Shopify-side allowlist: the merchant's own storefront plus Shopify's
 * CDN origins. Extend per-fetch with any additional trusted hosts.
 */
export const SHOPIFY_CDN_HOSTS: readonly string[] = [
  'myshopify.com',
  'cdn.shopify.com',
  'cdn.shopifycdn.net',
  'shop.app',
];
