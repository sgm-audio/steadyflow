import type { CommerceCatalog, CommerceProduct } from '../../schemas/product.js';
import type { CommerceOrder } from '../../schemas/order.js';
import type { CommerceInventoryLevel } from '../../schemas/inventory.js';
import { AdapterNotImplementedError, type SellingPlatformAdapter } from '../types.js';

/**
 * WooCommerce (WordPress) selling-platform readiness stub.
 * Prefer REST API v3 with Application Passwords or OAuth1.
 */
export class WooCommerceSellingAdapter implements SellingPlatformAdapter {
  readonly meta = {
    id: 'woocommerce' as const,
    role: 'selling' as const,
    stub: true,
    capabilities: ['list_catalog', 'get_product', 'list_orders', 'list_inventory', 'push_inventory'] as const,
  };

  readonly options: { storeUrl?: string | undefined };

  constructor(opts: { storeUrl?: string | undefined } = {}) {
    this.options = opts;
  }

  listCatalog(): Promise<CommerceCatalog> {
    return Promise.reject(new AdapterNotImplementedError('woocommerce', 'list_catalog'));
  }

  getProduct(_externalId: string): Promise<CommerceProduct | null> {
    return Promise.reject(new AdapterNotImplementedError('woocommerce', 'get_product'));
  }

  listOrders(_opts?: { since?: string; limit?: number }): Promise<CommerceOrder[]> {
    return Promise.reject(new AdapterNotImplementedError('woocommerce', 'list_orders'));
  }

  listInventory(): Promise<CommerceInventoryLevel[]> {
    return Promise.reject(new AdapterNotImplementedError('woocommerce', 'list_inventory'));
  }

  pushInventory(_levels: CommerceInventoryLevel[]): Promise<{ updated: number }> {
    return Promise.reject(new AdapterNotImplementedError('woocommerce', 'push_inventory'));
  }
}

export function createWooCommerceSellingAdapter(opts?: {
  storeUrl?: string | undefined;
}): WooCommerceSellingAdapter {
  return new WooCommerceSellingAdapter(opts ?? {});
}
