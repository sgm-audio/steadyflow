import { describe, expect, it } from 'vitest';
import { CommerceOrder } from '../../schemas/order.js';
import {
  mapAmazonCatalogItem,
  mapAmazonInventorySummary,
  mapAmazonOrder,
  mapAmazonOrderItems,
} from './mappers.js';

export const syntheticFbaOrder = {
  AmazonOrderId: '111-2222222-3333333',
  PurchaseDate: '2026-07-01T18:01:11Z',
  LastUpdateDate: '2026-07-01T18:02:30Z',
  OrderStatus: 'Unshipped',
  FulfillmentChannel: 'AFN',
  SalesChannel: 'Amazon.com',
  OrderTotal: { CurrencyCode: 'USD', Amount: '59.90' },
  ShippingAddress: {
    Name: 'Jane Doe',
    AddressLine1: '1 Main St',
    City: 'Seattle',
    StateOrRegion: 'WA',
    PostalCode: '98101',
    CountryCode: 'US',
    Phone: '+12065550100',
  },
};

const syntheticOrderItems = [
  {
    OrderItemId: 'oi-1',
    SKU: 'PRINT-001',
    Title: 'Test Print',
    QuantityOrdered: 2,
    ItemPrice: { CurrencyCode: 'USD', Amount: '59.90' },
  },
];

const syntheticListingSummary = {
  sku: 'PRINT-001',
  asin: 'B0TESTASIN1',
  marketplaceId: 'ATVPDKIKX0DER',
  itemName: 'Test Print',
  brand: 'Making Madi',
  status: 'ACTIVE',
};

const syntheticInventorySummary = {
  asin: 'B0TESTASIN1',
  sellerSku: 'PRINT-001',
  totalQuantity: 42,
};

describe('mapAmazonOrder', () => {
  it('maps an AFN (FBA) order to a CommerceOrder with amazon-fba routing', () => {
    const mapped = mapAmazonOrder(syntheticFbaOrder, syntheticOrderItems);
    const parsed = CommerceOrder.parse(mapped);

    expect(parsed.externalId).toBe('111-2222222-3333333');
    expect(parsed.platform).toBe('amazon');
    expect(parsed.status).toBe('paid');
    expect(parsed.fulfillmentProvider).toBe('amazon-fba');
    expect(parsed.currency).toBe('USD');
    expect(parsed.total).toEqual({ amount: 59.9, currency: 'USD' });
    expect(parsed.shippingAddress?.city).toBe('Seattle');
    expect(parsed.shippingAddress?.country).toBe('US');
    expect(parsed.createdAt).toBe('2026-07-01T18:01:11Z');
  });

  it('routes MFN orders to amazon-fbm', () => {
    const mapped = mapAmazonOrder({ ...syntheticFbaOrder, FulfillmentChannel: 'MFN' });
    expect(mapped.fulfillmentProvider).toBe('amazon-fbm');
  });

  it('maps the full Amazon order-status vocabulary', () => {
    const cases: [string, string][] = [
      ['Pending', 'pending'],
      ['Unshipped', 'paid'],
      ['PartiallyShipped', 'fulfilling'],
      ['Shipped', 'shipped'],
      ['Canceled', 'cancelled'],
      ['Unfulfillable', 'unknown'],
      ['InvoiceUnconfirmed', 'unknown'],
      ['SomethingNew', 'unknown'],
    ];
    for (const [spStatus, expected] of cases) {
      const mapped = mapAmazonOrder({ ...syntheticFbaOrder, OrderStatus: spStatus });
      expect(mapped.status).toBe(expected);
    }
  });

  it('tolerates missing OrderTotal and ShippingAddress', () => {
    const mapped = mapAmazonOrder({
      AmazonOrderId: '111-9999999-0000000',
      PurchaseDate: '2026-07-01T18:01:11Z',
      OrderStatus: 'Pending',
      FulfillmentChannel: 'AFN',
    });
    expect(mapped.total).toBeUndefined();
    expect(mapped.shippingAddress).toBeUndefined();
    expect(mapped.status).toBe('pending');
  });

  it('skips incomplete shipping addresses (missing required fields)', () => {
    const mapped = mapAmazonOrder({
      ...syntheticFbaOrder,
      ShippingAddress: { Name: 'Jane Doe', City: 'Seattle' },
    });
    expect(mapped.shippingAddress).toBeUndefined();
  });

  it('skips non-finite or negative order totals', () => {
    const mapped = mapAmazonOrder({
      ...syntheticFbaOrder,
      OrderTotal: { CurrencyCode: 'USD', Amount: 'not-a-number' },
    });
    expect(mapped.total).toBeUndefined();
    expect(mapped.currency).toBe('USD');
  });

  it('maps all optional address fields when present', () => {
    const mapped = mapAmazonOrder({
      ...syntheticFbaOrder,
      ShippingAddress: {
        Name: 'Jane Doe',
        AddressLine1: '1 Main St',
        AddressLine2: 'Apt 2',
        City: 'Seattle',
        StateOrRegion: 'WA',
        PostalCode: '98101',
        CountryCode: 'US',
        Phone: '+12065550100',
      },
    });
    expect(mapped.shippingAddress).toEqual({
      name: 'Jane Doe',
      line1: '1 Main St',
      line2: 'Apt 2',
      city: 'Seattle',
      region: 'WA',
      postalCode: '98101',
      country: 'US',
      phone: '+12065550100',
    });
  });

  it('maps MFN orders through the status vocabulary with no items', () => {
    const mapped = mapAmazonOrder({
      ...syntheticFbaOrder,
      FulfillmentChannel: 'MFN',
      OrderStatus: 'Shipped',
    });
    expect(mapped.lines).toHaveLength(0);
    expect(mapped.status).toBe('shipped');
  });
});

describe('mapAmazonOrderItems', () => {
  it('maps SP-API order items into CommerceOrderLines with unit price', () => {
    const lines = mapAmazonOrderItems(syntheticFbaOrder.AmazonOrderId, syntheticOrderItems);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.externalId).toBe('oi-1');
    expect(lines[0]?.sku).toBe('PRINT-001');
    expect(lines[0]?.quantity).toBe(2);
    expect(lines[0]?.unitPrice).toEqual({ amount: 59.9, currency: 'USD' });
  });
});

describe('mapAmazonCatalogItem', () => {
  it('maps a Listings summary into a CommerceProduct', () => {
    const mapped = mapAmazonCatalogItem(syntheticListingSummary);

    expect(mapped.platform).toBe('amazon');
    expect(mapped.externalId).toBe('B0TESTASIN1');
    expect(mapped.title).toBe('Test Print');
    expect(mapped.status).toBe('active');
    expect(mapped.url).toBe('https://www.amazon.com/dp/B0TESTASIN1');
    expect(mapped.variants).toHaveLength(1);
    expect(mapped.variants[0]?.sku).toBe('PRINT-001');
    expect(mapped.variants[0]?.barcode).toBe('B0TESTASIN1');
  });

  it('falls back to sku as externalId when ASIN is missing', () => {
    const mapped = mapAmazonCatalogItem({
      ...syntheticListingSummary,
      asin: undefined,
    });
    expect(mapped.externalId).toBe('PRINT-001');
    expect(mapped.variants[0]?.barcode).toBeUndefined();
  });
});

describe('mapAmazonInventorySummary', () => {
  it('maps an FBA inventory summary into a CommerceInventoryLevel', () => {
    const now = '2026-07-17T12:00:00.000Z';
    const mapped = mapAmazonInventorySummary(syntheticInventorySummary, now);

    expect(mapped.platform).toBe('amazon');
    expect(mapped.sku).toBe('PRINT-001');
    expect(mapped.externalVariantId).toBe('B0TESTASIN1');
    expect(mapped.available).toBe(42);
    expect(mapped.updatedAt).toBe(now);
  });

  it('accepts negative available quantities (Amazon can report negatives)', () => {
    const mapped = mapAmazonInventorySummary(
      { ...syntheticInventorySummary, totalQuantity: -3 },
      '2026-07-17T12:00:00.000Z',
    );
    expect(mapped.available).toBe(-3);
  });
});
