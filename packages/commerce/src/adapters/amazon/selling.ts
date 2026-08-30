import type { CommerceInventoryLevel } from '../../schemas/inventory.js';
import type { CommerceOrder } from '../../schemas/order.js';
import type { CommerceCatalog, CommerceProduct } from '../../schemas/product.js';
import { AdapterNotImplementedError, type SellingPlatformAdapter } from '../types.js';

export interface AmazonSellingAdapterOptions {
  /** Amazon marketplace id (e.g. ATVPDKIKX0DER for US). */
  marketplaceId?: string | undefined;
  region?: string | undefined;
  /** SP-API LWA refresh token — required for live calls. */
  refreshToken?: string | undefined;
}

/**
 * Amazon SP-API selling-platform readiness stub.
 *
 * Architecture notes (FBA/FBM):
 * - Listings sync → Catalog Items + Listings Items APIs
 * - Orders → Orders API; route FBA vs FBM by fulfillmentChannel
 * - Inventory → FBA Inventory API for AFN; Merchant Fulfillment / Inventory for MFN
 * - Do not mix FBA quantity into MFN push without an explicit channel map
 */
export class AmazonSellingAdapter implements SellingPlatformAdapter {
  readonly meta = {
    id: 'amazon' as const,
    role: 'selling' as const,
    stub: true,
    capabilities: [
      'list_catalog',
      'get_product',
      'list_orders',
      'list_inventory',
      'push_inventory',
    ] as const,
  };

  readonly options: AmazonSellingAdapterOptions;

  constructor(opts: AmazonSellingAdapterOptions = {}) {
    this.options = opts;
  }

  listCatalog(): Promise<CommerceCatalog> {
    return Promise.reject(new AdapterNotImplementedError('amazon', 'list_catalog'));
  }

  getProduct(_externalId: string): Promise<CommerceProduct | null> {
    return Promise.reject(new AdapterNotImplementedError('amazon', 'get_product'));
  }

  listOrders(_opts?: { since?: string; limit?: number }): Promise<CommerceOrder[]> {
    return Promise.reject(new AdapterNotImplementedError('amazon', 'list_orders'));
  }

  listInventory(): Promise<CommerceInventoryLevel[]> {
    return Promise.reject(new AdapterNotImplementedError('amazon', 'list_inventory'));
  }

  pushInventory(_levels: CommerceInventoryLevel[]): Promise<{ updated: number }> {
    return Promise.reject(new AdapterNotImplementedError('amazon', 'push_inventory'));
  }
}

export function createAmazonSellingAdapter(
  opts?: AmazonSellingAdapterOptions,
): AmazonSellingAdapter {
  return new AmazonSellingAdapter(opts ?? {});
}
