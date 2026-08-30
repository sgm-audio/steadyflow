import type {
  DistributorHandoffResult,
  DistributorOffer,
  DistributorOrderHandoff,
} from '../schemas/distributor.js';
import type { CommerceInventoryLevel } from '../schemas/inventory.js';
import type { CommerceOrder } from '../schemas/order.js';
import type { CommerceCatalog, CommerceProduct } from '../schemas/product.js';
import type {
  DistributorProviderId,
  FulfillmentProviderId,
  SellingPlatformId,
} from '../schemas/roles.js';

export type AdapterCapability =
  | 'list_catalog'
  | 'get_product'
  | 'list_orders'
  | 'list_inventory'
  | 'push_inventory'
  | 'submit_fulfillment'
  | 'list_offers'
  | 'handoff_order';

export interface AdapterMeta {
  readonly id: string;
  readonly role: 'selling' | 'fulfillment' | 'distributor';
  /** True when the adapter is a readiness stub (no live API yet). */
  readonly stub: boolean;
  readonly capabilities: readonly AdapterCapability[];
}

export interface SellingPlatformAdapter {
  readonly meta: AdapterMeta & { role: 'selling'; id: SellingPlatformId };
  listCatalog(): Promise<CommerceCatalog>;
  getProduct(externalId: string): Promise<CommerceProduct | null>;
  listOrders(opts?: { since?: string; limit?: number }): Promise<CommerceOrder[]>;
  listInventory(): Promise<CommerceInventoryLevel[]>;
  /**
   * Push inventory levels to the selling channel.
   * Stubs throw `AdapterNotImplementedError`.
   */
  pushInventory(levels: CommerceInventoryLevel[]): Promise<{ updated: number }>;
}

export interface FulfillmentAdapter {
  readonly meta: AdapterMeta & { role: 'fulfillment'; id: FulfillmentProviderId };
  /**
   * Submit a paid selling-platform order for production/shipping.
   */
  submitFulfillment(
    order: CommerceOrder,
  ): Promise<{ accepted: boolean; externalId?: string; message?: string }>;
  listInventory?(): Promise<CommerceInventoryLevel[]>;
}

export interface DistributorAdapter {
  readonly meta: AdapterMeta & { role: 'distributor'; id: DistributorProviderId };
  listOffers(query?: { q?: string; limit?: number }): Promise<DistributorOffer[]>;
  handoffOrder(req: DistributorOrderHandoff): Promise<DistributorHandoffResult>;
}

export class AdapterNotImplementedError extends Error {
  constructor(adapterId: string, capability: AdapterCapability) {
    super(`[commerce] Adapter '${adapterId}' does not implement '${capability}' yet`);
    this.name = 'AdapterNotImplementedError';
  }
}

export class AdapterNotReadyError extends Error {
  constructor(adapterId: string, reason: string) {
    super(`[commerce] Adapter '${adapterId}' is not ready: ${reason}`);
    this.name = 'AdapterNotReadyError';
  }
}
