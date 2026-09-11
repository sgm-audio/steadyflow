import { describe, expect, it } from 'vitest';
import { computeCoverageScore, detectTracking, verifyTracking } from './tracking.js';

const htmlWith = (snippets: string[]) => `<html><head>${snippets.join('\n')}</head><body>hi</body></html>`;

describe('detectTracking', () => {
  it('detects ga4 + gtm + meta together', () => {
    const html = htmlWith([
      `<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234"></script>`,
      `<script>gtag('config','G-ABC1234')</script>`,
      `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-XXXX1"></script>`,
      `<script src="https://connect.facebook.net/en_US/fbevents.js"></script><script>fbq('init','123456789')</script>`,
    ]);
    const checks = detectTracking(html);
    const by = Object.fromEntries(checks.map((c) => [c.provider, c])) as Record<string, { detected: boolean; evidence?: string }>;
    expect(by.ga4?.detected).toBe(true);
    expect(by.gtm?.detected).toBe(true);
    expect(by.meta_pixel?.detected).toBe(true);
    expect(by.ga4?.evidence).toBeDefined();
    expect((by.ga4?.evidence ?? '').length).toBeGreaterThan(0);
    expect((by.ga4?.evidence ?? '').length).toBeLessThanOrEqual(200);
  });

  it('detects shopify + klaviyo + tiktok + pinterest + snap', () => {
    const html = htmlWith([
      `<script src="https://cdn.shopify.com/shopifycloud/web-pixels-manager.js"></script>`,
      `<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>`,
      `<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script><script>ttq.track('ViewContent')</script>`,
      `<script src="https://ct.pinterest.com/v3/abc.js"></script>`,
      `<script src="https://sc-static.net/scevent.min.js"></script>`,
    ]);
    const m = Object.fromEntries(detectTracking(html).map((c) => [c.provider, c])) as Record<string, { detected: boolean }>;
    expect(m.shopify_analytics?.detected).toBe(true);
    expect(m.klaviyo?.detected).toBe(true);
    expect(m.tiktok_pixel?.detected).toBe(true);
    expect(m.pinterest_tag?.detected).toBe(true);
    expect(m.snapchat_pixel?.detected).toBe(true);
  });

  it('returns undetected for empty / unrelated html', () => {
    const checks = detectTracking('<html><body>hello</body></html>');
    for (const c of checks) expect(c.detected).toBe(false);
    expect(checks).toHaveLength(10);
  });

  it('is fail-closed on empty string', () => {
    const checks = detectTracking('   ');
    expect(checks.every((c) => !c.detected)).toBe(true);
  });

  it('evidence required when detected, absent when not', () => {
    const html = htmlWith([`<script src="https://cdn.segment.com/analytics.js"></script>`]);
    const checks = detectTracking(html);
    for (const c of checks) if (c.detected) expect(c.evidence && c.evidence.length > 0).toBe(true);
  });
});

describe('computeCoverageScore', () => {
  it('weights sum correctly (ga4 25 + shopify 15 = 40)', () => {
    const html = htmlWith([
      `<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST123"></script>`,
      `<script src="https://cdn.shopify.com/shopifycloud/web-pixels-manager.js"></script>`,
    ]);
    const score = computeCoverageScore(detectTracking(html));
    expect(score).toBe(40);
  });

  it('caps at 100', () => {
    const all = htmlWith([
      `<script src="https://www.googletagmanager.com/gtag/js?id=G-AAA1111"></script>`,
      `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-AAA11"></script>`,
      `<script src="https://connect.facebook.net/en_US/fbevents.js"></script>`,
      `<script>googletagmanager.com/gtag/js?id=AW-12345678</script>`,
      `<script src="https://cdn.shopify.com/shopifycloud/web-pixels-manager.js"></script>`,
      `<script src="https://cdn.segment.com/analytics.js"></script>`,
      `<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>`,
      `<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>`,
      `<script src="https://ct.pinterest.com/v3/x.js"></script>`,
      `<script src="https://sc-static.net/scevent.min.js"></script>`,
    ]);
    expect(computeCoverageScore(detectTracking(all))).toBe(100);
  });
});

describe('verifyTracking', () => {
  it('builds output with recommendations for missing providers', () => {
    const out = verifyTracking('https://example.myshopify.com', '<html></html>');
    expect(out.url).toBe('https://example.myshopify.com');
    expect(out.coverageScore).toBe(0);
    expect(out.recommendations.length).toBe(10);
    expect(out.checks.length).toBe(10);
    expect(new Date(out.fetchedAt).toString()).not.toBe('Invalid Date');
  });

  it('no recommendations when all detected', () => {
    const html = htmlWith([
      `<script src="https://www.googletagmanager.com/gtag/js?id=G-AAA1111"></script>`,
      `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-AAA11"></script>`,
      `<script src="https://connect.facebook.net/en_US/fbevents.js"></script>`,
      `<script>AW-12345678</script><script src="https://googleadservices.com/pagead/conversion.js"></script>`,
      `<script src="https://cdn.shopify.com/shopifycloud/web-pixels-manager.js"></script>`,
      `<script src="https://cdn.segment.com/analytics.js"></script>`,
      `<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>`,
      `<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>`,
      `<script src="https://ct.pinterest.com/v3/x.js"></script>`,
      `<script src="https://sc-static.net/scevent.min.js"></script>`,
    ]);
    const out = verifyTracking('https://example.myshopify.com', html);
    expect(out.coverageScore).toBe(100);
    expect(out.recommendations).toHaveLength(0);
  });
});
