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

  async listCatalog(): Promise<CommerceCatalog> {
    throw new AdapterNotImplementedError('woocommerce', 'list_catalog');
  }

  async getProduct(_externalId: string): Promise<CommerceProduct | null> {
    throw new AdapterNotImplementedError('woocommerce', 'get_product');
  }

  async listOrders(_opts?: { since?: string; limit?: number }): Promise<CommerceOrder[]> {
    throw new AdapterNotImplementedError('woocommerce', 'list_orders');
  }

  async listInventory(): Promise<CommerceInventoryLevel[]> {
    throw new AdapterNotImplementedError('woocommerce', 'list_inventory');
  }

  async pushInventory(_levels: CommerceInventoryLevel[]): Promise<{ updated: number }> {
    throw new AdapterNotImplementedError('woocommerce', 'push_inventory');
  }
}

export function createWooCommerceSellingAdapter(opts?: {
  storeUrl?: string | undefined;
}): WooCommerceSellingAdapter {
  return new WooCommerceSellingAdapter(opts ?? {});
}
