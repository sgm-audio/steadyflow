import { describe, expect, it } from 'vitest';
import { lintThemeHtml } from './theme.js';

const wrap = (body: string, extraHead = ''): string =>
  `<html lang="en"><head><meta name="viewport" content="width=device-width">${extraHead}</head><body class="shopify-section">${body}</body></html>`;

describe('lintThemeHtml', () => {
  it('returns no issues for empty input', () => {
    expect(lintThemeHtml('')).toEqual({ issueCount: 0, highCount: 0, issues: [] });
  });

  it('flags missing lang and viewport as high', () => {
    const r = lintThemeHtml('<html><head></head><body></body></html>');
    expect(r.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['html_missing_lang', 'missing_viewport']),
    );
    expect(r.highCount).toBeGreaterThanOrEqual(2);
  });

  it('flags images without alt', () => {
    const r = lintThemeHtml(wrap('<img src="/a.jpg"><img src="/b.jpg" alt="ok">'));
    const img = r.issues.find((i) => i.code === 'img_missing_alt');
    expect(img?.message).toBe('1/2 <img> tag(s) missing alt.');
    expect(img?.severity).toBe('high');
  });

  it('flags document.write as high', () => {
    const r = lintThemeHtml(wrap('<script>document.write("x")</script>'));
    expect(r.issues.some((i) => i.code === 'document_write' && i.severity === 'high')).toBe(true);
  });

  it('passes a clean OS 2.0 homepage', () => {
    const html = wrap(
      '<a href="#main">Skip</a><main id="main"><img src="/hero.jpg" alt="Hero"></main>',
      '<link rel="canonical" href="https://example.myshopify.com/">',
    );
    const r = lintThemeHtml(html);
    expect(r.issues.map((i) => i.code)).toEqual([]);
  });
});
