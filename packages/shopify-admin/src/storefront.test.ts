import { describe, it, expect } from 'vitest';
import { analyzeStorefrontHtml } from './storefront.js';

const STORE = 'example.myshopify.com';

describe('analyzeStorefrontHtml', () => {
  it('classifies first-party vs third-party vs known-app scripts', () => {
    const html = `
      <html><head>
        <script src="/theme.js"></script>
        <script src="https://example.myshopify.com/cdn/assets.js"></script>
        <script src="https://cdn.shopify.com/s/files/1/123/theme.js"></script>
        <script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
        <script src="https://cdn.judge.me/widget.js"></script>
        <script src="https://mystery.cdn.example/tracker.js"></script>
      </head><body><img src="a.jpg" width="100" height="100"></body></html>
    `;
    const a = analyzeStorefrontHtml(html, STORE);
    expect(a.totalScripts).toBe(6);
    expect(a.appHosts.map((h) => h.appName)).toEqual(expect.arrayContaining(['Klaviyo', 'Judge.me']));
    expect(a.thirdPartyHosts.map((h) => h.host)).toContain('mystery.cdn.example');
    // First-party scripts are not counted as third-party or app.
    expect(a.thirdPartyHosts.map((h) => h.host)).not.toContain(STORE);
    expect(a.thirdPartyHosts.map((h) => h.host)).not.toContain('cdn.shopify.com');
  });

  it('counts render-blocking scripts in <head> without async/defer/module', () => {
    const html = `
      <html><head>
        <script src="https://cdn.shopify.com/a.js"></script>
        <script src="https://cdn.shopify.com/b.js" defer></script>
        <script src="https://cdn.shopify.com/c.js" async></script>
        <script type="module" src="https://cdn.shopify.com/d.js"></script>
      </head><body></body></html>
    `;
    const a = analyzeStorefrontHtml(html, STORE);
    expect(a.renderBlockingScripts).toBe(1); // only a.js
  });

  it('flags undimensioned images and missing preload', () => {
    const html = `
      <html><head></head><body>
        <img src="a.jpg">
        <img src="b.jpg" width="100" height="100">
      </body></html>
    `;
    const a = analyzeStorefrontHtml(html, STORE);
    expect(a.totalImages).toBe(2);
    expect(a.imagesWithoutDimensions).toBe(1);
    expect(a.hasPreload).toBe(false);
    expect(a.renderBlockingRisk).toBe('high'); // missing preload
  });

  it('detects preload and sets lower LCP risk', () => {
    const html = `
      <html><head>
        <link rel="preload" href="/hero.jpg" as="image">
      </head><body><img src="a.jpg" width="100" height="100"></body></html>
    `;
    const a = analyzeStorefrontHtml(html, STORE);
    expect(a.hasPreload).toBe(true);
    expect(a.renderBlockingRisk).toBe('low');
  });

  it('raises CLS risk when most images lack dimensions', () => {
    const html = `<html><head></head><body><img src="a.jpg"><img src="b.jpg"></body></html>`;
    const a = analyzeStorefrontHtml(html, STORE);
    expect(a.layoutShiftRisk).toBe('high');
    expect(a.inefficiencyScore).toBeGreaterThan(0);
  });

  it('handles protocol-relative and relative script URLs', () => {
    const html = `<html><head>
      <script src="//static.klaviyo.com/onsite/js/x.js"></script>
      <script src="/local.js"></script>
    </head><body></body></html>`;
    const a = analyzeStorefrontHtml(html, STORE);
    expect(a.appHosts.map((h) => h.appName)).toContain('Klaviyo');
    expect(a.thirdPartyHosts).toEqual([]); // /local.js is first-party
  });
});
