import { PrintifyClient } from '@steadyflow/shopify-admin';
import type { CommerceOrder } from '../../schemas/order.js';
import type { CommerceInventoryLevel } from '../../schemas/inventory.js';
import {
  AdapterNotImplementedError,
  AdapterNotReadyError,
  type FulfillmentAdapter,
} from '../types.js';

export interface PrintifyFulfillmentAdapterOptions {
  token: string;
  /** Prefer a specific Printify shop id; otherwise first shop is used. */
  shopId?: number | undefined;
}

/**
 * Printify fulfillment adapter.
 * Catalog/cost matching remains in `@steadyflow/shopify-admin`; this adapter
 * owns order handoff for POD production once order APIs are wired.
 */
export class PrintifyFulfillmentAdapter implements FulfillmentAdapter {
  readonly meta = {
    id: 'printify' as const,
    role: 'fulfillment' as const,
    stub: false,
    capabilities: ['submit_fulfillment', 'list_inventory'] as const,
  };

  private readonly client: PrintifyClient;
  private resolvedShopId: number | null = null;

  constructor(opts: PrintifyFulfillmentAdapterOptions) {
    if (!opts.token.trim()) {
      throw new AdapterNotReadyError('printify', 'token is required');
    }
    this.client = new PrintifyClient(opts.token);
    if (typeof opts.shopId === 'number') {
      this.resolvedShopId = opts.shopId;
    }
  }

  private async shopId(): Promise<number> {
    if (this.resolvedShopId !== null) return this.resolvedShopId;
    const shops = await this.client.listShops();
    const shop = shops[0];
    if (!shop) {
      throw new AdapterNotReadyError('printify', 'no Printify shops in account');
    }
    this.resolvedShopId = shop.id;
    return shop.id;
  }

  /**
   * Readiness: validates shop connectivity. Full order create API wiring is next.
   */
  async submitFulfillment(order: CommerceOrder): Promise<{ accepted: boolean; externalId?: string; message?: string }> {
    const shopId = await this.shopId();
    // Connectivity probe — ensures token + shop resolve before claiming readiness.
    await this.client.fetchShopCatalog(shopId);
    return {
      accepted: false,
      message: `Printify shop ${shopId} reachable; order create for ${order.externalId} not implemented yet (use Printify Shopify integration or Orders API next)`,
    };
  }

  listInventory(): Promise<CommerceInventoryLevel[]> {
    // Printify POD inventory is effectively unlimited blanks — not stock levels.
    return Promise.reject(new AdapterNotImplementedError('printify', 'list_inventory'));
  }
}

export function createPrintifyFulfillmentAdapter(
  opts: PrintifyFulfillmentAdapterOptions,
): PrintifyFulfillmentAdapter {
  return new PrintifyFulfillmentAdapter(opts);
}
