import { describe, expect, it } from 'vitest';
import {
  crawlSitemapUrls,
  extractSitemapUrls,
  isAllowedByRobots,
  isSitemapIndex,
  parseRobotsDisallows,
  selectCrawlTargets,
} from './sitemap.js';

const mockFetch = (responder: (url: string) => Response | Promise<Response>): typeof fetch =>
  ((input: unknown) => {
    const url = typeof input === 'string' ? input : new URL(input as URL).toString();
    return responder(url);
  }) as typeof fetch;

const SITEMAP_URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.myshopify.com/</loc></url>
  <url><loc>https://example.myshopify.com/products/blue-hoodie</loc></url>
  <url><loc>https://example.myshopify.com/products/red-hoodie</loc></url>
  <url><loc>https://example.myshopify.com/collections/frontpage</loc></url>
  <url><loc>https://example.myshopify.com/pages/about</loc></url>
</urlset>`;

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.myshopify.com/sitemap_products_1.xml</loc></sitemap>
  <sitemap><loc>https://example.myshopify.com/sitemap_collections_1.xml</loc></sitemap>
</sitemapindex>`;

const CHILD_PRODUCTS = `<?xml version="1.0"?><urlset>
  <url><loc>https://example.myshopify.com/products/a</loc></url>
  <url><loc>https://example.myshopify.com/products/b</loc></url>
  <url><loc>https://example.myshopify.com/products/c</loc></url>
</urlset>`;

const CHILD_COLLECTIONS = `<?xml version="1.0"?><urlset>
  <url><loc>https://example.myshopify.com/collections/summer</loc></url>
  <url><loc>https://example.myshopify.com/pages/contact</loc></url>
</urlset>`;

describe('extractSitemapUrls', () => {
  it('extracts loc entries', () => {
    expect(extractSitemapUrls(SITEMAP_URLSET)).toEqual([
      'https://example.myshopify.com/',
      'https://example.myshopify.com/products/blue-hoodie',
      'https://example.myshopify.com/products/red-hoodie',
      'https://example.myshopify.com/collections/frontpage',
      'https://example.myshopify.com/pages/about',
    ]);
  });
  it('returns empty for no locs', () => {
    expect(extractSitemapUrls('<urlset></urlset>')).toEqual([]);
  });
});

describe('isSitemapIndex', () => {
  it('detects sitemap index', () => {
    expect(isSitemapIndex(SITEMAP_INDEX)).toBe(true);
  });
  it('is false for plain urlset', () => {
    expect(isSitemapIndex(SITEMAP_URLSET)).toBe(false);
  });
});

describe('parseRobotsDisallows + isAllowedByRobots', () => {
  it('parses Disallow for wildcard UA', () => {
    const txt = 'User-agent: *\nDisallow: /products/hidden\nDisallow: /admin\n';
    const d = parseRobotsDisallows(txt);
    expect(d).toEqual(['/products/hidden', '/admin']);
  });
  it('ignores Disallow for non-wildcard UA', () => {
    const txt = 'User-agent: Googlebot\nDisallow: /products/\nUser-agent: *\nDisallow: /secret\n';
    expect(parseRobotsDisallows(txt)).toEqual(['/secret']);
  });
  it('isAllowedByRobots respects prefix', () => {
    expect(
      isAllowedByRobots('https://example.myshopify.com/products/hidden-thing', [
        '/products/hidden',
      ]),
    ).toBe(false);
    expect(
      isAllowedByRobots('https://example.myshopify.com/products/visible', ['/products/hidden']),
    ).toBe(true);
  });
});

describe('selectCrawlTargets', () => {
  it('keeps only product/collection, caps 20, same host, skips robots', () => {
    const urls = [
      'https://example.myshopify.com/',
      'https://example.myshopify.com/products/a',
      'https://example.myshopify.com/collections/x',
      'https://example.myshopify.com/pages/about',
      'https://evil.com/products/a',
    ];
    const robots = 'User-agent: *\nDisallow: /collections/x';
    expect(selectCrawlTargets(urls, 'example.myshopify.com', robots)).toEqual([
      'https://example.myshopify.com/products/a',
    ]);
  });
  it('caps at 20', () => {
    const urls = Array.from(
      { length: 30 },
      (_, i) => `https://example.myshopify.com/products/p${i}`,
    );
    expect(selectCrawlTargets(urls, 'example.myshopify.com', null)).toHaveLength(20);
  });
});

describe('crawlSitemapUrls', () => {
  it('returns product/collection URLs from a plain urlset', async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith('/sitemap.xml')) return new Response(SITEMAP_URLSET, { status: 200 });
      if (url.endsWith('/robots.txt'))
        return new Response('User-agent: *\nAllow: /', { status: 200 });
      return new Response('not found', { status: 404 });
    });
    const r = await crawlSitemapUrls('https://example.myshopify.com', { fetchImpl });
    expect(r).toEqual([
      'https://example.myshopify.com/products/blue-hoodie',
      'https://example.myshopify.com/products/red-hoodie',
      'https://example.myshopify.com/collections/frontpage',
    ]);
  });

  it('follows sitemap index children and aggregates', async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith('/sitemap.xml')) return new Response(SITEMAP_INDEX, { status: 200 });
      if (url.includes('sitemap_products_1')) return new Response(CHILD_PRODUCTS, { status: 200 });
      if (url.includes('sitemap_collections_1'))
        return new Response(CHILD_COLLECTIONS, { status: 200 });
      if (url.endsWith('/robots.txt'))
        return new Response('User-agent: *\nAllow: /', { status: 200 });
      return new Response('not found', { status: 404 });
    });
    const r = await crawlSitemapUrls('https://example.myshopify.com', { fetchImpl });
    expect(r.sort()).toEqual(
      [
        'https://example.myshopify.com/products/a',
        'https://example.myshopify.com/products/b',
        'https://example.myshopify.com/products/c',
        'https://example.myshopify.com/collections/summer',
      ].sort(),
    );
  });

  it('filters robots-disallowed URLs', async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith('/sitemap.xml')) return new Response(SITEMAP_URLSET, { status: 200 });
      if (url.endsWith('/robots.txt'))
        return new Response('User-agent: *\nDisallow: /products/red-hoodie', { status: 200 });
      return new Response('not found', { status: 404 });
    });
    const r = await crawlSitemapUrls('https://example.myshopify.com', { fetchImpl });
    expect(r).not.toContain('https://example.myshopify.com/products/red-hoodie');
    expect(r).toContain('https://example.myshopify.com/products/blue-hoodie');
  });

  it('fail-closed on 404 sitemap', async () => {
    const fetchImpl = mockFetch(() => new Response('nope', { status: 404 }));
    const r = await crawlSitemapUrls('https://example.myshopify.com', { fetchImpl });
    expect(r).toEqual([]);
  });

  it('fail-closed on huge sitemap (>1MB)', async () => {
    const huge = 'x'.repeat(1_000_001);
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith('/sitemap.xml')) return new Response(huge, { status: 200 });
      return new Response('ok', { status: 200 });
    });
    const r = await crawlSitemapUrls('https://example.myshopify.com', { fetchImpl });
    expect(r).toEqual([]);
  });

  it('fail-closed on network error (returns empty, does not throw)', async () => {
    const fetchImpl = mockFetch(() => {
      throw new Error('network down');
    });
    const r = await crawlSitemapUrls('https://example.myshopify.com', { fetchImpl });
    expect(r).toEqual([]);
  });

  it('caps first 20 product/collection URLs', async () => {
    const many = Array.from(
      { length: 30 },
      (_, i) => `  <url><loc>https://example.myshopify.com/products/p${i}</loc></url>`,
    ).join('\n');
    const xml = `<?xml?><urlset>${many}</urlset>`;
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith('/sitemap.xml')) return new Response(xml, { status: 200 });
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      return new Response('not found', { status: 404 });
    });
    const r = await crawlSitemapUrls('https://example.myshopify.com', { fetchImpl });
    expect(r).toHaveLength(20);
  });
});
