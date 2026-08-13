import { describe, it, expect } from 'vitest';
import { calcMargin } from './margin.js';
import { evaluateFlags } from './flags.js';
import { buildCostLookup } from '../printify/catalog.js';
import type { ShopifyProduct } from '../shopify/schema.js';

function makeProduct(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'test-print',
    title: 'Test Print',
    status: 'ACTIVE',
    productType: 'Wall Art',
    vendor: '',
    tags: ['canvas'],
    descriptionHtml: `<p>${'word '.repeat(90).trim()}</p>`,
    priceRangeV2: {
      minVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
      maxVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
    },
    variants: {
      edges: [
        { node: { id: 'v1', sku: 'PRINT-001', title: 'Default', price: '40.00', weight: 0.5, weightUnit: 'kg' } },
      ],
    },
    images: {
      edges: [{ node: { id: 'i1', altText: 'A framed canvas print', url: 'https://example.com/1.jpg' } }],
    },
    collections: {
      edges: [{ node: { id: 'c1', title: 'Wall Art', handle: 'wall-art' } }],
    },
    options: [],
    featuredImage: null,
    seo: { title: null, description: null },
    ...overrides,
  };
}

describe('calcMargin', () => {
  it('computes real margin from matched Printify costs', () => {
    const costLookup = buildCostLookup([
      { id: 1, title: 'Canvas Print', variants: [{ id: 1, sku: 'PRINT-001', cost: 1500 }] },
    ]);
    const product = makeProduct();
    const margin = calcMargin(product, { shopCurrency: 'CAD', fxRate: 1, costLookup });

    expect(margin.matchedVariants).toBe(1);
    expect(margin.costMinCAD).toBeCloseTo(15, 2);
    expect(margin.marginAvg$).toBeCloseTo(25, 2); // $40 price - $15 cost
    expect(margin.marginPct).toBeCloseTo(62.5, 1); // 25/40 * 100
  });

  it('falls back to null margin data when no cost lookup is available', () => {
    const product = makeProduct();
    const margin = calcMargin(product, { shopCurrency: 'CAD', fxRate: 1, costLookup: null });

    expect(margin.matchedVariants).toBe(0);
    expect(margin.marginPct).toBeNull();
    expect(margin.unlinkedVariants).toEqual(['PRINT-001']);
  });

  it('converts USD costs/prices to CAD using the given FX rate', () => {
    const costLookup = buildCostLookup([
      { id: 1, title: 'Canvas Print', variants: [{ id: 1, sku: 'PRINT-001', cost: 1000 }] },
    ]);
    const product = makeProduct({
      priceRangeV2: {
        minVariantPrice: { amount: '30.00', currencyCode: 'USD' },
        maxVariantPrice: { amount: '30.00', currencyCode: 'USD' },
      },
    });
    const margin = calcMargin(product, { shopCurrency: 'USD', fxRate: 1.37, costLookup });

    expect(margin.priceMinCAD).toBeCloseTo(41.1, 2); // 30 * 1.37
    expect(margin.costMinCAD).toBeCloseTo(13.7, 2); // 10 * 1.37
  });
});

describe('evaluateFlags', () => {
  it('flags a low-margin, real-data-backed product as red', () => {
    const costLookup = buildCostLookup([
      { id: 1, title: 'Canvas Print', variants: [{ id: 1, sku: 'PRINT-001', cost: 3200 }] },
    ]);
    const product = makeProduct();
    const margin = calcMargin(product, { shopCurrency: 'CAD', fxRate: 1, costLookup });
    const flags = evaluateFlags({ product, margin, fxFallback: false });

    const lowMargin = flags.find((f) => f.code === 'low_margin');
    expect(lowMargin).toBeDefined();
    expect(lowMargin?.severity).toBe('red');
  });

  it('flags missing alt text, short description, and orphaned products', () => {
    const product = makeProduct({
      descriptionHtml: '<p>Too short</p>',
      images: { edges: [{ node: { id: 'i1', altText: null, url: 'https://example.com/1.jpg' } }] },
      collections: { edges: [] },
    });
    const margin = calcMargin(product, { shopCurrency: 'CAD', fxRate: 1, costLookup: null });
    const flags = evaluateFlags({ product, margin, fxFallback: false });
    const codes = flags.map((f) => f.code);

    expect(codes).toContain('missing_alt_text');
    expect(codes).toContain('short_description');
    expect(codes).toContain('orphaned');
  });

  it('does not flag a healthy, well-described, collection-linked product', () => {
    const costLookup = buildCostLookup([
      { id: 1, title: 'Canvas Print', variants: [{ id: 1, sku: 'PRINT-001', cost: 1000 }] },
    ]);
    const product = makeProduct({
      vendor: 'Making Madi',
      images: {
        edges: [
          { node: { id: 'i1', altText: 'Framed canvas print front', url: 'https://example.com/1.jpg' } },
          { node: { id: 'i2', altText: 'Framed canvas print angle', url: 'https://example.com/2.jpg' } },
          { node: { id: 'i3', altText: 'Framed canvas print detail', url: 'https://example.com/3.jpg' } },
        ],
      },
      seo: {
        title: 'Modern Framed Canvas Wall Art Print for Home Office',
        description: 'This beautiful framed canvas print brings modern wall art to your space. Made with premium materials, it is a perfect gift or home office accent piece that elevates any room.',
      },
    });
    const margin = calcMargin(product, { shopCurrency: 'CAD', fxRate: 1, costLookup });
    const flags = evaluateFlags({ product, margin, fxFallback: false });

    expect(flags).toEqual([]);
  });
});
