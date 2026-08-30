import { describe, expect, it } from 'vitest';
import type { ShopifyProduct } from '../shopify/schema.js';
import { evaluateInventoryFlags, LOW_STOCK_THRESHOLD } from './inventory.js';

function makeProduct(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'test',
    title: 'Test Print',
    status: 'ACTIVE',
    productType: 'Wall Art',
    vendor: '',
    tags: [],
    descriptionHtml: '<p>word</p>'.repeat(50),
    priceRangeV2: {
      minVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
      maxVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
    },
    variants: {
      edges: [
        {
          node: {
            id: 'v1',
            sku: 'SKU-1',
            title: 'Default',
            price: '40.00',
            inventoryQuantity: 10,
            inventoryPolicy: 'DENY',
          },
        },
      ],
    },
    images: { edges: [{ node: { id: 'i1', altText: 'img', url: 'https://x/1.jpg' } }] },
    collections: { edges: [] },
    options: [],
    featuredImage: null,
    seo: { title: null, description: null },
    totalInventory: 10,
    tracksInventory: true,
    ...overrides,
  };
}

describe('evaluateInventoryFlags', () => {
  it(`flags products with low stock (≤${LOW_STOCK_THRESHOLD} units, > 0)`, () => {
    const flags = evaluateInventoryFlags({
      product: makeProduct({
        totalInventory: LOW_STOCK_THRESHOLD,
        variants: {
          edges: [
            {
              node: {
                id: 'v1',
                sku: 'SKU-1',
                title: 'Default',
                price: '40.00',
                inventoryQuantity: LOW_STOCK_THRESHOLD,
              },
            },
          ],
        },
      }),
    });
    expect(flags.some((f) => f.code === 'inventory_low_stock')).toBe(true);
  });

  it('does not flag zero-stock products (out_of_stock is the right flag for that)', () => {
    const flags = evaluateInventoryFlags({
      product: makeProduct({
        totalInventory: 0,
        variants: {
          edges: [
            {
              node: {
                id: 'v1',
                sku: 'SKU-1',
                title: 'Default',
                price: '40.00',
                inventoryQuantity: 0,
              },
            },
          ],
        },
      }),
    });
    expect(flags.some((f) => f.code === 'inventory_low_stock')).toBe(false);
  });

  it('flags tracking disabled with 0 stock (overselling risk)', () => {
    const flags = evaluateInventoryFlags({
      product: makeProduct({
        tracksInventory: false,
        totalInventory: 0,
        variants: {
          edges: [
            {
              node: {
                id: 'v1',
                sku: 'SKU-1',
                title: 'Default',
                price: '40.00',
                inventoryQuantity: 0,
              },
            },
          ],
        },
      }),
    });
    expect(flags.some((f) => f.code === 'inventory_overselling')).toBe(true);
  });

  it('flags inventoryPolicy=CONTINUE with 0 stock (overselling)', () => {
    const flags = evaluateInventoryFlags({
      product: makeProduct({
        variants: {
          edges: [
            {
              node: {
                id: 'v1',
                sku: 'SKU-1',
                title: 'Default',
                price: '40.00',
                inventoryQuantity: 0,
                inventoryPolicy: 'CONTINUE',
              },
            },
          ],
        },
      }),
    });
    expect(flags.some((f) => f.code === 'inventory_continue_when_out')).toBe(true);
  });

  it('does not flag a well-stocked product', () => {
    const flags = evaluateInventoryFlags({
      product: makeProduct({
        totalInventory: 100,
        variants: {
          edges: [
            {
              node: {
                id: 'v1',
                sku: 'SKU-1',
                title: 'Default',
                price: '40.00',
                inventoryQuantity: 100,
              },
            },
          ],
        },
      }),
    });
    expect(flags).toEqual([]);
  });
});
