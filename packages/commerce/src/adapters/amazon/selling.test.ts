import { describe, expect, it, vi } from 'vitest';
import type { SpApiCredentials } from './credential.js';
import { AmazonFbaFulfillmentAdapter, AmazonFbmFulfillmentAdapter } from './fulfillment.js';
import { createAmazonSellingAdapter, type AmazonSellingAdapterOptions } from './selling.js';
import { AdapterNotImplementedError } from '../types.js';
import { syntheticFbaOrder } from './mappers.test.js';

export const creds: SpApiCredentials = {
  clientId: 'amzn1.application-oa2-client.test',
  clientSecret: 'amzn1.otoken.test',
  refreshToken: 'Atzr|refresh-token',
  awsAccessKeyId: 'AKIDEXAMPLE',
  awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  sellerId: 'A1SELLERID',
  marketplaceIds: ['ATVPDKIKX0DER'],
  region: 'na',
};

export function routeFetch(routes: { match: RegExp; reply: () => Response }[]) {
  return vi.fn((url: string | URL | Request): Promise<Response> => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (u.includes('auth/o2/token')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: 'Atza|token-1', expires_in: 3600, token_type: 'bearer' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    for (const route of routes) {
      if (route.match.test(u)) return Promise.resolve(route.reply());
    }
    return Promise.resolve(
      new Response(JSON.stringify({ errors: [{ code: 'NotFound', message: `no route for ${u}` }] }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

function liveOpts(fetchImpl: ReturnType<typeof routeFetch>): AmazonSellingAdapterOptions {
  return { ...creds, fetchImpl };
}

describe('createAmazonSellingAdapter', () => {
  it('preserves stub behavior without credentials (readiness gap is loud)', async () => {
    const amazon = createAmazonSellingAdapter();
    expect(amazon.meta.stub).toBe(true);
    await expect(amazon.listCatalog()).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });

  it('throws AdapterNotReadyError for incomplete live credentials', () => {
    expect(() => createAmazonSellingAdapter({ refreshToken: 'x' })).toThrow();
  });
});

describe('live AmazonSellingAdapter', () => {
  it('marks meta as live with full capabilities', () => {
    const amazon = createAmazonSellingAdapter(liveOpts(routeFetch([])));
    expect(amazon.meta.stub).toBe(false);
    expect(amazon.meta.id).toBe('amazon');
    expect(amazon.meta.capabilities).toContain('list_orders');
    expect(amazon.meta.capabilities).toContain('push_inventory');
  });

  it('listOrders fetches SP-API orders + per-order items and routes FBA/FBM', async () => {
    const fetchImpl = routeFetch([
      {
        match: /orderItems/,
        reply: () =>
          new Response(
            JSON.stringify({
              OrderItems: [
                {
                  OrderItemId: 'oi-1',
                  SKU: 'PRINT-001',
                  Title: 'Test Print',
                  QuantityOrdered: 2,
                  ItemPrice: { CurrencyCode: 'USD', Amount: '59.90' },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      },
      {
        match: /\/orders\/v0\/orders/,
        reply: () =>
          new Response(
            JSON.stringify({
              payload: {
                Orders: [syntheticFbaOrder],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      },
    ]);
    const amazon = createAmazonSellingAdapter(liveOpts(fetchImpl));

    const orders = await amazon.listOrders({ since: '2026-07-01T00:00:00Z' });

    expect(orders).toHaveLength(1);
    expect(orders[0]?.fulfillmentProvider).toBe('amazon-fba');
    expect(orders[0]?.lines[0]?.sku).toBe('PRINT-001');
    const calledUrl =
      fetchImpl.mock.calls.find((c) => (c[0] as string).includes('/orders/v0/orders'))?.[0] ?? '';
    expect(calledUrl).toContain('MarketplaceIds=ATVPDKIKX0DER');
    expect(calledUrl).toContain('CreatedAfter=2026-07-01T00%3A00%3A00Z');
  });

  it('listCatalog paginates through searchListings via NextToken', async () => {
    const summary = {
      sku: 'PRINT-001',
      asin: 'B0TESTASIN1',
      marketplaceId: 'ATVPDKIKX0DER',
      itemName: 'Test Print',
      brand: 'Making Madi',
      status: 'ACTIVE',
    };
    let catalogCalls = 0;
    const fetchImpl = routeFetch([
      {
        match: /listings\/2021-01-08\/items\/A1SELLERID\?/,
        reply: () => {
          catalogCalls++;
          const page = catalogCalls === 1
            ? {
                numberOfResults: 2,
                items: [
                  { sku: summary.sku, asin: summary.asin, summaries: [summary] },
                  { itemName: 'malformed, no sku or summary' },
                ],
                pagination: { nextToken: 'TOKEN2' },
              }
            : {
                numberOfResults: 2,
                items: [{ sku: 'PRINT-002', asin: 'B0TESTASIN2', summaries: [{ ...summary, sku: 'PRINT-002', asin: 'B0TESTASIN2', itemName: 'Second Print' }] }],
              };
          return new Response(JSON.stringify(page), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    ]);
    const amazon = createAmazonSellingAdapter(liveOpts(fetchImpl));

    const catalog = await amazon.listCatalog();

    expect(catalog.platform).toBe('amazon');
    expect(catalog.currency).toBe('USD');
    expect(catalog.products).toHaveLength(2);
    expect(catalog.totalProducts).toBe(2);
    const secondCallUrl = (fetchImpl.mock.calls[2]?.[0] ?? '') as string;
    expect(secondCallUrl).toContain('pageToken=TOKEN2');
  });

  it('getProduct returns null for 404 (no throw)', async () => {
    const fetchImpl = routeFetch([
      {
        match: /items\/A1SELLERID\/PRINT-404/,
        reply: () =>
          new Response(JSON.stringify({ errors: [{ code: 'NotFound', message: 'not found' }] }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    ]);
    const amazon = createAmazonSellingAdapter(liveOpts(fetchImpl));

    const product = await amazon.getProduct('PRINT-404');
    expect(product).toBeNull();
  });

  it('getProduct returns null when the response carries no summary', async () => {
    const fetchImpl = routeFetch([
      {
        match: /items\/A1SELLERID\/PRINT-001/,
        reply: () =>
          new Response(JSON.stringify({ sku: 'PRINT-001' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    ]);
    const amazon = createAmazonSellingAdapter(liveOpts(fetchImpl));

    const product = await amazon.getProduct('PRINT-001');
    expect(product).toBeNull();
  });

  it('getProduct rethrows non-404 errors loudly', async () => {
    const fetchImpl = routeFetch([
      {
        match: /items\/A1SELLERID\/PRINT-001/,
        reply: () =>
          new Response(
            JSON.stringify({ errors: [{ code: 'InternalFailure', message: 'boom' }] }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          ),
      },
    ]);
    const amazon = createAmazonSellingAdapter(liveOpts(fetchImpl));

    await expect(amazon.getProduct('PRINT-001')).rejects.toThrow(/HTTP 500/);
  });

  it('listInventory maps FBA inventory summaries', async () => {
    const fetchImpl = routeFetch([
      {
        match: /fba\/inventory\/v1\/summaries/,
        reply: () =>
          new Response(
            JSON.stringify({
              payload: {
                inventorySummaries: [{ asin: 'B0TESTASIN1', sellerSku: 'PRINT-001', totalQuantity: 42 }],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      },
    ]);
    const amazon = createAmazonSellingAdapter(liveOpts(fetchImpl));

    const levels = await amazon.listInventory();

    expect(levels).toHaveLength(1);
    expect(levels[0]?.sku).toBe('PRINT-001');
    expect(levels[0]?.available).toBe(42);
    expect(levels[0]?.platform).toBe('amazon');
  });

  it('pushInventory patches each SKU and counts updates', async () => {
    const patched: string[] = [];
    const fetchImpl = routeFetch([
      {
        match: /items\/A1SELLERID\//,
        reply: () => {
          patched.push('hit');
          return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
      },
    ]);
    const amazon = createAmazonSellingAdapter(liveOpts(fetchImpl));

    const result = await amazon.pushInventory([
      { platform: 'amazon', sku: 'PRINT-001', available: 42, updatedAt: '2026-07-17T12:00:00.000Z' },
      { platform: 'amazon', sku: 'PRINT-002', available: 10, updatedAt: '2026-07-17T12:00:00.000Z' },
    ]);

    expect(result.updated).toBe(2);
    expect(patched).toHaveLength(2);
  });

  it('pushInventory reports failed SKUs instead of failing silently', async () => {
    const fetchImpl = routeFetch([
      {
        match: /PRINT-BAD/,
        reply: () =>
          new Response(
            JSON.stringify({ errors: [{ code: 'InvalidInput', message: 'bad sku' }] }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
      },
      {
        match: /items\/A1SELLERID\//,
        reply: () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      },
    ]);
    const amazon = createAmazonSellingAdapter(liveOpts(fetchImpl));

    const result = await amazon.pushInventory([
      { platform: 'amazon', sku: 'PRINT-001', available: 42, updatedAt: '2026-07-17T12:00:00.000Z' },
      { platform: 'amazon', sku: 'PRINT-BAD', available: 10, updatedAt: '2026-07-17T12:00:00.000Z' },
    ]);

    expect(result.updated).toBe(1);
    expect(result.failed).toEqual(['PRINT-BAD']);
  });
});

describe('AmazonFbaFulfillmentAdapter', () => {
  it('accepts Amazon AFN orders as auto-fulfilled by Amazon', async () => {
    const fba = new AmazonFbaFulfillmentAdapter();

    const result = await fba.submitFulfillment({
      externalId: '111-2222222-3333333',
      platform: 'amazon',
      status: 'paid',
      currency: 'USD',
      lines: [
        { externalId: 'oi-1', sku: 'PRINT-001', title: 'Test Print', quantity: 2 },
      ],
      fulfillmentProvider: 'amazon-fba',
      createdAt: '2026-07-01T18:01:11Z',
    });

    expect(result.accepted).toBe(true);
    expect(result.externalId).toBe('111-2222222-3333333');
  });

  it('rejects non-AFN orders with a clear message', async () => {
    const fba = new AmazonFbaFulfillmentAdapter();

    const result = await fba.submitFulfillment({
      externalId: 'shop-1',
      platform: 'shopify',
      status: 'paid',
      currency: 'CAD',
      lines: [{ externalId: 'v1', sku: 'S', title: 'T', quantity: 1 }],
      createdAt: '2026-07-01T18:01:11Z',
    });

    expect(result.accepted).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('listInventory is a loud readiness gap in the fulfillment adapter', async () => {
    const fba = new AmazonFbaFulfillmentAdapter();
    await expect(fba.listInventory()).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });
});

describe('AmazonFbmFulfillmentAdapter', () => {
  it('remains a loud readiness gap for MFN shipments', async () => {
    const fbm = new AmazonFbmFulfillmentAdapter();
    await expect(
      fbm.submitFulfillment({
        externalId: '111-2222222-3333333',
        platform: 'amazon',
        status: 'paid',
        currency: 'USD',
        lines: [{ externalId: 'oi-1', sku: 'PRINT-001', title: 'Test Print', quantity: 1 }],
        createdAt: '2026-07-01T18:01:11Z',
      }),
    ).rejects.toBeInstanceOf(AdapterNotImplementedError);
  });
});
