import { describe, it, expect } from 'vitest';
import {
  detectUndifferentiatedProducts,
  detectLopsidedAssortment,
  detectSingleCollectionConcentration,
  evaluateMixFlags,
} from './mix.js';
import type { AuditRow } from '../index.js';
import { calcMargin } from './margin.js';
import { evaluateFlags } from './flags.js';
import type { ShopifyProduct } from '../shopify/schema.js';

function makeRow(title: string, productType: string, collections: string[] = []): AuditRow {
  const product: ShopifyProduct = {
    id: `gid://shopify/Product/${title.replace(/\s+/g, '-')}`,
    handle: title.toLowerCase().replace(/\s+/g, '-'),
    title,
    status: 'ACTIVE',
    productType,
    vendor: '',
    tags: [],
    descriptionHtml: `<p>${'word '.repeat(100).trim()}</p>`,
    priceRangeV2: {
      minVariantPrice: { amount: '30.00', currencyCode: 'CAD' },
      maxVariantPrice: { amount: '30.00', currencyCode: 'CAD' },
    },
    variants: { edges: [{ node: { id: 'v1', sku: 'SKU-1', title: 'Default', price: '30.00', weight: { value: 0.5, unit: 'KILOGRAMS' } } }] },
    images: { edges: [{ node: { id: 'i1', altText: 'image', url: 'https://x/1.jpg' } }] },
    collections: { edges: collections.map((c, i) => ({ node: { id: `c${i}`, title: c, handle: c.toLowerCase() } })) },
    options: [],
    featuredImage: null,
    seo: { title: null, description: null },
  };
  const margin = calcMargin(product, { shopCurrency: 'CAD', fxRate: 1, costLookup: null });
  const flags = evaluateFlags({ product, margin, fxFallback: false });
  return { product, margin, flags, primarySku: 'SKU-1', collectionTitles: collections, flagCategories: { core: 0, mix: 0, conversion: 0, inventory: 0, marketing: 0 } };
}

describe('detectUndifferentiatedProducts', () => {
  it('groups near-duplicate titles (size/color stripped)', () => {
    const rows = [
      makeRow('Sunset Canvas Print', 'Wall Art'),
      makeRow('Sunset Canvas Print XL', 'Wall Art'),
      makeRow('Sunset Canvas Print Black', 'Wall Art'),
      makeRow('Mountain Canvas Print', 'Wall Art'),
    ];
    const dupes = detectUndifferentiatedProducts(rows);
    expect(dupes.length).toBe(1);
    expect(dupes[0]?.length).toBe(3);
  });

  it('does not flag distinct titles', () => {
    const dupes = detectUndifferentiatedProducts([
      makeRow('Sunset Canvas', 'Wall Art'),
      makeRow('Mountain Canvas', 'Wall Art'),
    ]);
    expect(dupes.length).toBe(0);
  });
});

describe('detectLopsidedAssortment', () => {
  it('flags a catalog with >80% in one type', () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => makeRow(`Print ${i}`, 'Wall Art')),
      makeRow('Mug 1', 'Drinkware'),
    ];
    const result = detectLopsidedAssortment(rows);
    expect(result).toEqual({ dominantType: 'Wall Art', sharePct: 90 });
  });

  it('returns null for balanced catalogs', () => {
    const rows = [
      makeRow('Print 1', 'Wall Art'),
      makeRow('Mug 1', 'Drinkware'),
      makeRow('Mug 2', 'Drinkware'),
    ];
    expect(detectLopsidedAssortment(rows)).toBeNull();
  });

  it('returns null for tiny catalogs (<5 products)', () => {
    const rows = [makeRow('Print 1', 'Wall Art'), makeRow('Print 2', 'Wall Art')];
    expect(detectLopsidedAssortment(rows)).toBeNull();
  });
});

describe('detectSingleCollectionConcentration', () => {
  it('flags catalogs with all products in one collection', () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(`P${i}`, 'Type', ['Featured']));
    expect(detectSingleCollectionConcentration(rows)).toBe('Featured');
  });

  it('does not flag mixed-collection catalogs', () => {
    const rows = [
      makeRow('A', 'T', ['Featured']),
      makeRow('B', 'T', ['New Arrivals']),
    ];
    expect(detectSingleCollectionConcentration(rows)).toBeNull();
  });
});

describe('evaluateMixFlags', () => {
  it('produces no flags for a balanced, well-merchandised catalog', () => {
    const rows = [
      makeRow('Sunset Print', 'Wall Art', ['Featured', 'New']),
      makeRow('Mountain Mug', 'Drinkware', ['New']),
      makeRow('Beach Towel', 'Apparel', ['Summer']),
    ];
    const flags = evaluateMixFlags({ rows, collections: [] });
    expect(flags).toEqual([]);
  });

  it('emits all three flag types when applicable', () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => makeRow(`Print ${i}`, 'Wall Art', ['Featured'])),
      makeRow('Sunset Print', 'Wall Art', ['Featured']),
      makeRow('Sunset Print XL', 'Wall Art', ['Featured']),
    ];
    const flags = evaluateMixFlags({ rows, collections: [] });
    const codes = flags.map((f) => f.code);
    expect(codes).toContain('mix_undifferentiated');
    expect(codes).toContain('mix_lopsided');
    expect(codes).toContain('mix_single_collection');
  });
});
