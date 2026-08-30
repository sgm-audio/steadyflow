import type { ShopifyProduct } from '@steadyflow/shopify-admin';
import { describe, expect, it } from 'vitest';
import { createAlibabaDistributorAdapter } from './adapters/alibaba/distributor.js';
import { createAmazonSellingAdapter } from './adapters/amazon/selling.js';
import { AdapterNotImplementedError } from './adapters/types.js';
import {
  CommerceConfigSchema,
  CommerceProduct,
  createCommerceRegistry,
  mapShopifyProduct,
} from './index.js';

const orgId = '11111111-1111-1111-1111-111111111111';

function sampleShopifyProduct(): ShopifyProduct {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'test-print',
    title: 'Test Print',
    status: 'ACTIVE',
    productType: 'Wall Art',
    vendor: '',
    tags: ['canvas'],
    descriptionHtml: '<p>hello</p>',
    priceRangeV2: {
      minVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
      maxVariantPrice: { amount: '40.00', currencyCode: 'CAD' },
    },
    variants: {
      edges: [
        {
          node: {
            id: 'gid://shopify/ProductVariant/1',
            sku: 'PRINT-001',
            title: 'Default',
            price: '40.00',
            weight: { value: 0.5, unit: 'KILOGRAMS' },
          },
        },
      ],
    },
    images: {
      edges: [{ node: { id: 'i1', altText: 'Art', url: 'https://example.com/1.jpg' } }],
    },
    collections: {
      edges: [{ node: { id: 'c1', title: 'Wall Art', handle: 'wall-art' } }],
    },
    options: [],
  };
}

describe('CommerceConfigSchema', () => {
  it('accepts a Shopify-primary multi-platform config', () => {
    const cfg = CommerceConfigSchema.parse({
      orgId,
      primarySelling: 'shopify',
      selling: [
        { platform: 'shopify', enabled: true, storeUrl: 'https://demo.myshopify.com' },
        { platform: 'amazon', enabled: true, region: 'NA' },
      ],
      fulfillment: [
        { provider: 'printify', enabled: true },
        { provider: 'amazon-fba', enabled: false },
      ],
      distributors: [{ provider: 'alibaba', enabled: true, preferredCurrency: 'USD' }],
      syncInventory: true,
      autoFulfill: false,
    });

    expect(cfg.primarySelling).toBe('shopify');
    expect(cfg.selling).toHaveLength(2);
    expect(cfg.distributors[0]?.provider).toBe('alibaba');
  });

  it('rejects primarySelling not present in selling[]', () => {
    expect(() =>
      CommerceConfigSchema.parse({
        orgId,
        primarySelling: 'amazon',
        selling: [{ platform: 'shopify', enabled: true, storeUrl: 'https://demo.myshopify.com' }],
      }),
    ).toThrow();
  });
});

describe('mapShopifyProduct', () => {
  it('maps Admin API product into CommerceProduct', () => {
    const mapped = mapShopifyProduct(sampleShopifyProduct(), 'CAD', '2026-07-17T12:00:00.000Z');
    const parsed = CommerceProduct.parse(mapped);

    expect(parsed.platform).toBe('shopify');
    expect(parsed.externalId).toBe('gid://shopify/Product/1');
    expect(parsed.variants[0]?.sku).toBe('PRINT-001');
    expect(parsed.variants[0]?.weightGrams).toBe(500);
    expect(parsed.images[0]?.altText).toBe('Art');
    expect(parsed.collections).toContain('Wall Art');
  });
});

describe('createCommerceRegistry', () => {
  it('tracks experimental platforms as stubs and skips Shopify without credentials', () => {
    const config = CommerceConfigSchema.parse({
      orgId,
      primarySelling: 'shopify',
      selling: [
        { platform: 'shopify', enabled: true, storeUrl: 'https://demo.myshopify.com' },
        { platform: 'amazon', enabled: true, region: 'NA' },
        { platform: 'woocommerce', enabled: true, storeUrl: 'https://example.com' },
      ],
      fulfillment: [
        { provider: 'printify', enabled: true },
        { provider: 'amazon-fba', enabled: true },
      ],
      distributors: [{ provider: 'alibaba', enabled: true }],
    });

    const registry = createCommerceRegistry({ config, credentials: {} });

    // v0.x trim: experimental adapters not instantiated, only tracked in stubAdapters.
    expect(registry.selling.has('shopify')).toBe(false);
    expect(registry.selling.has('amazon')).toBe(false);
    expect(registry.selling.has('woocommerce')).toBe(false);
    expect(registry.fulfillment.has('amazon-fba')).toBe(false);
    expect(registry.distributors.has('alibaba')).toBe(false);
    expect(registry.readySelling).toEqual([]);
    expect(registry.stubAdapters).toEqual(
      expect.arrayContaining(['amazon', 'woocommerce', 'amazon-fba', 'alibaba']),
    );
  });

  it('constructs live Shopify + Printify adapters when credentials are present', () => {
    const config = CommerceConfigSchema.parse({
      orgId,
      primarySelling: 'shopify',
      selling: [{ platform: 'shopify', enabled: true, storeUrl: 'https://demo.myshopify.com' }],
      fulfillment: [{ provider: 'printify', enabled: true }],
    });

    const registry = createCommerceRegistry({
      config,
      credentials: { 'shopify-admin': 'shpat_test', printify: 'printify_test' },
    });

    expect(registry.selling.has('shopify')).toBe(true);
    expect(registry.selling.get('shopify')?.meta.stub).toBe(false);
    expect(registry.fulfillment.has('printify')).toBe(true);
    expect(registry.readySelling).toEqual(['shopify']);
  });
});

describe('stub adapters', () => {
  it('Amazon listCatalog throws AdapterNotImplementedError', async () => {
    const amazon = createAmazonSellingAdapter();
    await expect(amazon.listCatalog()).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });

  it('Alibaba listOffers throws AdapterNotImplementedError', async () => {
    const alibaba = createAlibabaDistributorAdapter();
    await expect(alibaba.listOffers()).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });
});
