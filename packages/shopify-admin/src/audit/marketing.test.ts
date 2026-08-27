import { describe, it, expect } from 'vitest';
import { evaluateMarketingFlags, MIN_DESCRIPTION_CHARS } from './marketing.js';
import type { ShopifyProduct } from '../shopify/schema.js';

function makeProduct(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'test',
    title: 'Test Print',
    status: 'ACTIVE',
    productType: 'Wall Art',
    vendor: '',
    tags: ['canvas', 'modern'],
    descriptionHtml: `<p>${'word '.repeat(100).trim()}</p>`,
    priceRangeV2: {
      minVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
      maxVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
    },
    compareAtPriceRange: {
      minVariantCompareAtPrice: { amount: '50.00', currencyCode: 'CAD' },
      maxVariantCompareAtPrice: { amount: '50.00', currencyCode: 'CAD' },
    },
    variants: { edges: [{ node: { id: 'v1', sku: 'SKU-1', title: 'Default', price: '40.00' } }] },
    images: { edges: [{ node: { id: 'i1', altText: 'img', url: 'https://x/1.jpg' } }] },
    collections: { edges: [] },
    options: [],
    featuredImage: null,
    seo: { title: null, description: null },
    publishedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('evaluateMarketingFlags', () => {
  it('flags products with empty tags array', () => {
    const flags = evaluateMarketingFlags({ product: makeProduct({ tags: [] }) });
    expect(flags.some((f) => f.code === 'marketing_no_tags')).toBe(true);
  });

  it(`flags products with descriptions shorter than ${MIN_DESCRIPTION_CHARS} chars`, () => {
    const flags = evaluateMarketingFlags({ product: makeProduct({ descriptionHtml: '<p>short</p>' }) });
    expect(flags.some((f) => f.code === 'marketing_no_description')).toBe(true);
  });

  it('flags ACTIVE products with no publishedAt date', () => {
    const flags = evaluateMarketingFlags({ product: makeProduct({ status: 'ACTIVE', publishedAt: null }) });
    expect(flags.some((f) => f.code === 'marketing_never_published')).toBe(true);
  });

  it('flags products with no compare-at price range', () => {
    const flags = evaluateMarketingFlags({ product: makeProduct({ compareAtPriceRange: undefined }) });
    expect(flags.some((f) => f.code === 'marketing_no_compare_at_range')).toBe(true);
  });

  it('does not flag a healthy marketing-ready product', () => {
    const flags = evaluateMarketingFlags({ product: makeProduct() });
    expect(flags).toEqual([]);
  });
});
