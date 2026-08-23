import { describe, it, expect } from 'vitest';
import { evaluateConversionFlags, MAX_TITLE_LENGTH, HIGH_PRICE_THRESHOLD } from './conversion.js';
import type { ShopifyProduct } from '../shopify/schema.js';

function makeProduct(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'test',
    title: 'Test Print',
    status: 'ACTIVE',
    productType: 'Wall Art',
    vendor: '',
    tags: ['canvas'],
    descriptionHtml: '<p>word</p>'.repeat(50),
    priceRangeV2: {
      minVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
      maxVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
    },
    variants: { edges: [{ node: { id: 'v1', sku: 'SKU-1', title: 'Default', price: '40.00', barcode: '123456' } }] },
    images: { edges: [{ node: { id: 'i1', altText: 'img', url: 'https://x/1.jpg' } }] },
    collections: { edges: [] },
    options: [],
    featuredImage: null,
    seo: { title: null, description: null },
    ...overrides,
  };
}

describe('evaluateConversionFlags', () => {
  it('flags product with no barcode on any variant', () => {
    const product = makeProduct({
      variants: { edges: [{ node: { id: 'v1', sku: 'SKU-1', title: 'Default', price: '40.00', barcode: null } }] },
    });
    const flags = evaluateConversionFlags({ product });
    expect(flags.some((f) => f.code === 'conversion_no_barcode')).toBe(true);
  });

  it('flags product with no SKU on any variant', () => {
    const product = makeProduct({
      variants: { edges: [{ node: { id: 'v1', sku: null, title: 'Default', price: '40.00' } }] },
    });
    const flags = evaluateConversionFlags({ product });
    expect(flags.some((f) => f.code === 'conversion_no_sku')).toBe(true);
  });

  it(`flags titles longer than ${MAX_TITLE_LENGTH} chars`, () => {
    const longTitle = 'A'.repeat(MAX_TITLE_LENGTH + 1);
    const flags = evaluateConversionFlags({ product: makeProduct({ title: longTitle }) });
    expect(flags.some((f) => f.code === 'conversion_long_title')).toBe(true);
  });

  it(`flags prices above ${HIGH_PRICE_THRESHOLD} with no compare-at`, () => {
    const flags = evaluateConversionFlags({
      product: makeProduct({
        priceRangeV2: {
          minVariantPrice: { amount: '75.00', currencyCode: 'CAD' },
          maxVariantPrice: { amount: '75.00', currencyCode: 'CAD' },
        },
      }),
    });
    expect(flags.some((f) => f.code === 'conversion_high_price_no_compare_at')).toBe(true);
  });

  it('does not flag a healthy, mid-priced product with barcodes', () => {
    const flags = evaluateConversionFlags({
      product: makeProduct({
        title: 'Modern Wall Art',
        variants: {
          edges: [{ node: { id: 'v1', sku: 'SKU-1', title: 'Default', price: '40.00', barcode: '123456' } }],
        },
      }),
    });
    expect(flags).toEqual([]);
  });
});
