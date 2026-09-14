import type { CommerceInventoryLevel } from '../../schemas/inventory.js';
import type { CommerceOrder, CommerceOrderLine } from '../../schemas/order.js';
import type { CommerceProduct } from '../../schemas/product.js';

export interface SpApiOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  LastUpdateDate?: string;
  OrderStatus: string;
  FulfillmentChannel: string;
  OrderTotal?: { CurrencyCode: string; Amount: string } | undefined;
  ShippingAddress?:
    | {
        Name?: string;
        AddressLine1?: string;
        AddressLine2?: string;
        City?: string;
        StateOrRegion?: string;
        PostalCode?: string;
        CountryCode?: string;
        Phone?: string;
      }
    | undefined;
}

export interface SpApiOrderItem {
  OrderItemId: string;
  SKU?: string;
  Title?: string;
  QuantityOrdered: number;
  ItemPrice?: { CurrencyCode: string; Amount: string } | undefined;
}

export interface SpApiListingSummary {
  sku: string;
  asin?: string | undefined;
  marketplaceId?: string | undefined;
  itemName?: string | undefined;
  brand?: string | undefined;
  status?: string | undefined;
}

export interface SpApiInventorySummary {
  asin?: string | undefined;
  sellerSku: string;
  totalQuantity: number;
}

export const AMAZON_STATUS_MAP: Record<string, CommerceOrder['status']> = {
  Pending: 'pending',
  Unshipped: 'paid',
  PartiallyShipped: 'fulfilling',
  Shipped: 'shipped',
  Canceled: 'cancelled',
  Unfulfillable: 'unknown',
  InvoiceUnconfirmed: 'unknown',
};

export const MARKETPLACE_CURRENCY: Record<string, string> = {
  ATVPDKIKX0DER: 'USD',
  A2EUQWT73G2NAU: 'CAD',
  A1AM78C64UM0Y8: 'MXN',
  A1F83G8C2ARO7P: 'GBP',
  A13V1IB3VIYZZH: 'EUR',
  A1PA6795UKMFR9: 'EUR',
  A1VC38T7YXB528: 'JPY',
  A39IBJ37TRP1C6: 'AUD',
};

function toMoney(part: { CurrencyCode: string; Amount: string } | undefined) {
  if (!part) return undefined;
  const amount = Number(part.Amount);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return { amount, currency: part.CurrencyCode };
}

/**
 * Map an SP-API order (+ its items when fetched) into a CommerceOrder.
 * AFN (FBA) orders route to `amazon-fba`; MFN to `amazon-fbm`.
 */
export function mapAmazonOrder(o: SpApiOrder, items: SpApiOrderItem[] = []): CommerceOrder {
  const addr = o.ShippingAddress;
  const shipping =
    addr?.AddressLine1 && addr.City && addr.PostalCode && addr.CountryCode
      ? {
          ...(addr.Name ? { name: addr.Name } : {}),
          line1: addr.AddressLine1,
          ...(addr.AddressLine2 ? { line2: addr.AddressLine2 } : {}),
          city: addr.City,
          ...(addr.StateOrRegion ? { region: addr.StateOrRegion } : {}),
          postalCode: addr.PostalCode,
          country: addr.CountryCode,
          ...(addr.Phone ? { phone: addr.Phone } : {}),
        }
      : undefined;

  return {
    externalId: o.AmazonOrderId,
    platform: 'amazon',
    status: AMAZON_STATUS_MAP[o.OrderStatus] ?? 'unknown',
    currency: o.OrderTotal?.CurrencyCode ?? 'USD',
    ...(toMoney(o.OrderTotal) ? { total: toMoney(o.OrderTotal) } : {}),
    lines: mapAmazonOrderItems(o.AmazonOrderId, items),
    ...(shipping ? { shippingAddress: shipping } : {}),
    fulfillmentProvider: o.FulfillmentChannel === 'MFN' ? 'amazon-fbm' : 'amazon-fba',
    createdAt: o.PurchaseDate,
    ...(o.LastUpdateDate ? { updatedAt: o.LastUpdateDate } : {}),
  };
}

export function mapAmazonOrderItems(
  _orderId: string,
  items: SpApiOrderItem[],
): CommerceOrderLine[] {
  return items.map((item) => ({
    externalId: item.OrderItemId,
    ...(item.SKU ? { sku: item.SKU } : {}),
    title: item.Title ?? item.OrderItemId,
    quantity: Math.max(1, Math.floor(item.QuantityOrdered)),
    ...(toMoney(item.ItemPrice) ? { unitPrice: toMoney(item.ItemPrice) } : {}),
  }));
}

/** Map a Listings Items summary into a CommerceProduct (single-variant). */
export function mapAmazonCatalogItem(summary: SpApiListingSummary): CommerceProduct {
  const externalId = summary.asin ?? summary.sku;
  const title = summary.itemName ?? summary.sku;
  return {
    externalId,
    platform: 'amazon',
    ...(summary.sku ? { handle: summary.sku } : {}),
    title,
    status: summary.status === 'ACTIVE' ? 'active' : 'unknown',
    ...(summary.brand ? { productType: summary.brand } : {}),
    ...(summary.asin ? { url: `https://www.amazon.com/dp/${summary.asin}` } : {}),
    tags: [],
    images: [],
    variants: [
      {
        externalId,
        ...(summary.sku ? { sku: summary.sku } : {}),
        title,
        ...(summary.asin ? { barcode: summary.asin } : {}),
      },
    ],
    collections: [],
    syncedAt: new Date().toISOString(),
  };
}

export function mapAmazonInventorySummary(
  summary: SpApiInventorySummary,
  now: string,
): CommerceInventoryLevel {
  return {
    platform: 'amazon',
    sku: summary.sellerSku,
    ...(summary.asin ? { externalVariantId: summary.asin } : {}),
    available: summary.totalQuantity,
    locationId: 'FBA',
    updatedAt: now,
  };
}
