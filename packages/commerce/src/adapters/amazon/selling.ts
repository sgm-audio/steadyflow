import type { AdapterMeta, SellingPlatformAdapter } from '../types.js';
import { AdapterNotImplementedError, AdapterNotReadyError } from '../types.js';
import { parseAmazonSpApiCredentials, type SpApiCredentials } from './credential.js';
import {
  mapAmazonCatalogItem,
  mapAmazonInventorySummary,
  mapAmazonOrder,
  MARKETPLACE_CURRENCY,
  type SpApiInventorySummary,
  type SpApiListingSummary,
  type SpApiOrder,
  type SpApiOrderItem,
} from './mappers.js';
import { extractPayload, SpApiClient, type SpApiClientOptions } from './spapi/client.js';
import type { CommerceInventoryLevel } from '../../schemas/inventory.js';
import type { CommerceOrder } from '../../schemas/order.js';
import type { CommerceCatalog, CommerceProduct } from '../../schemas/product.js';

export interface AmazonSellingAdapterOptions {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  refreshToken?: string | undefined;
  awsAccessKeyId?: string | undefined;
  awsSecretAccessKey?: string | undefined;
  sellerId?: string | undefined;
  marketplaceIds?: readonly string[] | undefined;
  region?: SpApiCredentials['region'] | undefined;
  /** Test/di seam: override the global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AmazonPushInventoryResult {
  updated: number;
  /** SKUs whose patch failed — never silent. */
  failed?: string[];
}

const LISTINGS_API = '/listings/2021-01-08/items';
const MAX_CATALOG_PAGES = 20;
const MAX_ORDER_PAGES = 5;

/**
 * Amazon SP-API selling adapter.
 * - Catalog/listings → Listings Items API (searchListings, paginated via pageToken)
 * - Orders → Orders API + per-order orderItems; FBA vs FBM routed by FulfillmentChannel
 * - Inventory (AFN) → FBA Inventory summaries
 * - Push inventory → patchListingsItem (fulfillment_availability, DEFAULT channel)
 *
 * Architecture note: do not mix FBA quantity into MFN push — this adapter only
 * writes the merchant-fulfilled channel; FBA stock truth stays in FBA Inventory.
 */
export class AmazonSellingAdapter implements SellingPlatformAdapter {
  readonly meta: AdapterMeta & { role: 'selling'; id: 'amazon' };

  private readonly client: SpApiClient | null = null;
  private readonly sellerId: string = '';
  private readonly marketplaceIds: readonly string[] = [];

  constructor(opts: AmazonSellingAdapterOptions = {}) {
    this.meta = {
      id: 'amazon',
      role: 'selling',
      stub: true,
      capabilities: [
        'list_catalog',
        'get_product',
        'list_orders',
        'list_inventory',
        'push_inventory',
      ],
    };

    const provided = [
      opts.clientId,
      opts.clientSecret,
      opts.refreshToken,
      opts.awsAccessKeyId,
      opts.awsSecretAccessKey,
      opts.sellerId,
      opts.marketplaceIds,
    ].filter((f) => f !== undefined).length;

    if (provided === 0) {
      // No credentials at all → keep the readiness stub (loud not-implemented).
      return;
    }
    if (
      !opts.clientId ||
      !opts.clientSecret ||
      !opts.refreshToken ||
      !opts.awsAccessKeyId ||
      !opts.awsSecretAccessKey ||
      !opts.sellerId ||
      !opts.marketplaceIds ||
      opts.marketplaceIds.length === 0
    ) {
      throw new AdapterNotReadyError(
        'amazon',
        'clientId, clientSecret, refreshToken, awsAccessKeyId, awsSecretAccessKey, sellerId and marketplaceIds are required for live SP-API calls',
      );
    }

    this.meta = { ...this.meta, stub: false };
    this.sellerId = opts.sellerId;
    this.marketplaceIds = opts.marketplaceIds;
    this.client = new SpApiClient(
      parseAmazonSpApiCredentials({
        clientId: opts.clientId,
        clientSecret: opts.clientSecret,
        refreshToken: opts.refreshToken,
        awsAccessKeyId: opts.awsAccessKeyId,
        awsSecretAccessKey: opts.awsSecretAccessKey,
        sellerId: opts.sellerId,
        marketplaceIds: [...opts.marketplaceIds],
        ...(opts.region ? { region: opts.region } : {}),
      }),
      {
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      } satisfies SpApiClientOptions,
    );
  }

  async listCatalog(): Promise<CommerceCatalog> {
    if (!this.client) throw new AdapterNotImplementedError('amazon', 'list_catalog');
    const client = this.client;
    const marketplaceId = this.marketplaceIds[0] ?? '';
    const products: CommerceProduct[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
      const res = await client.request(
        `${LISTINGS_API}/${encodeURIComponent(this.sellerId)}`,
        {
          query: {
            marketplaceIds: marketplaceId,
            includedData: 'summaries',
            pageSize: 100,
            ...(pageToken ? { pageToken } : {}),
          },
        },
      );
      const body = (res ?? {}) as {
        items?: { sku?: string; asin?: string; summaries?: SpApiListingSummary[] }[];
        pagination?: { nextToken?: string };
        numberOfResults?: number;
      };
      const items = body.items ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        const summary = item.summaries?.[0];
        if (!item.sku && !summary) {
          console.warn('[commerce/amazon] Skipping malformed listings item (no sku/summary)');
          continue;
        }
        products.push(
          mapAmazonCatalogItem(
            summary ?? { sku: item.sku ?? '', asin: item.asin },
          ),
        );
      }

      pageToken = body.pagination?.nextToken;
      if (!pageToken) break;
    }

    return {
      platform: 'amazon',
      currency: MARKETPLACE_CURRENCY[marketplaceId] ?? 'USD',
      products,
      totalProducts: products.length,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getProduct(externalId: string): Promise<CommerceProduct | null> {
    if (!this.client) throw new AdapterNotImplementedError('amazon', 'get_product');
    try {
      const res = await this.client.request(
        `${LISTINGS_API}/${encodeURIComponent(this.sellerId)}/${encodeURIComponent(externalId)}`,
        {
          query: {
            marketplaceIds: this.marketplaceIds[0] ?? '',
            includedData: 'summaries',
          },
        },
      );
      const summary = (res as { summaries?: SpApiListingSummary[] }).summaries?.[0];
      if (!summary) return null;
      return mapAmazonCatalogItem(summary);
    } catch (err) {
      if (err instanceof Error && err.message.includes('HTTP 404')) return null;
      throw err;
    }
  }

  async listOrders(opts?: { since?: string; limit?: number }): Promise<CommerceOrder[]> {
    if (!this.client) throw new AdapterNotImplementedError('amazon', 'list_orders');
    const client = this.client;
    const limit = Math.min(opts?.limit ?? 20, 100);
    const since =
      opts?.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const orders: CommerceOrder[] = [];
    let nextToken: string | undefined;

    for (let page = 0; page < MAX_ORDER_PAGES && orders.length < limit; page++) {
      const res = await client.request('/orders/v0/orders', {
        query: {
          MarketplaceIds: this.marketplaceIds.join(','),
          MaxResultsPerPage: String(Math.min(limit, 100)),
          CreatedAfter: since,
          ...(nextToken ? { NextToken: nextToken } : {}),
        },
      });
      const payload = extractPayload(res);
      const spOrders = (payload.Orders as SpApiOrder[] | undefined) ?? [];
      if (spOrders.length === 0) break;

      for (const spOrder of spOrders) {
        if (orders.length >= limit) break;
        const itemsRes = await client.request(
          `/orders/v0/orders/${encodeURIComponent(spOrder.AmazonOrderId)}/orderItems`,
        );
        const itemsPayload = extractPayload(itemsRes);
        const items = (itemsPayload.OrderItems as SpApiOrderItem[] | undefined) ?? [];
        const mapped = mapAmazonOrder(spOrder, items);
        orders.push(mapped);
      }

      nextToken = payload.NextToken as string | undefined;
      if (!nextToken) break;
    }

    return orders;
  }

  async listInventory(): Promise<CommerceInventoryLevel[]> {
    if (!this.client) throw new AdapterNotImplementedError('amazon', 'list_inventory');
    const res = await this.client.request('/fba/inventory/v1/summaries', {
      query: {
        details: 'true',
        granularityType: 'Marketplace',
        granularityId: this.marketplaceIds[0] ?? '',
        marketplaceIds: this.marketplaceIds.join(','),
      },
    });
    const payload = extractPayload(res);
    const summaries = (payload.inventorySummaries as SpApiInventorySummary[] | undefined) ?? [];
    const now = new Date().toISOString();
    return summaries.map((s) => mapAmazonInventorySummary(s, now));
  }

  async pushInventory(levels: CommerceInventoryLevel[]): Promise<AmazonPushInventoryResult> {
    if (!this.client) throw new AdapterNotImplementedError('amazon', 'push_inventory');
    let updated = 0;
    const failed: string[] = [];

    for (const level of levels) {
      try {
        await this.client.request(
          `${LISTINGS_API}/${encodeURIComponent(this.sellerId)}/${encodeURIComponent(level.sku)}`,
          {
            method: 'PATCH',
            query: { marketplaceIds: this.marketplaceIds[0] ?? '', issueLocale: 'en_US' },
            body: {
              productType: 'PRODUCT',
              patches: [
                {
                  op: 'replace',
                  path: '/fulfillment_availability',
                  value: [{ fulfillment_channel: 'DEFAULT', quantity: level.available }],
                },
              ],
            },
          },
        );
        updated++;
      } catch (err) {
        failed.push(level.sku);
        console.warn(`[commerce/amazon] Inventory push failed for ${level.sku}: ${String(err)}`);
      }
    }

    return failed.length > 0 ? { updated, failed } : { updated };
  }
}

export function createAmazonSellingAdapter(
  opts?: AmazonSellingAdapterOptions,
): AmazonSellingAdapter {
  return new AmazonSellingAdapter(opts ?? {});
}
