import { runCatalogAudit, type CatalogAuditResult } from '@steadyflow/shopify-admin';
import { mapShopifyAuditToCatalog, mapShopifyProduct } from '../../mappers/shopify.js';
import type { CommerceCatalog, CommerceProduct } from '../../schemas/product.js';
import type { CommerceOrder } from '../../schemas/order.js';
import type { CommerceInventoryLevel } from '../../schemas/inventory.js';
import {
  AdapterNotImplementedError,
  AdapterNotReadyError,
  type SellingPlatformAdapter,
} from '../types.js';

export interface ShopifySellingAdapterOptions {
  storeUrl: string;
  adminToken: string;
  printifyToken?: string | undefined;
}

/**
 * Live selling-platform adapter backed by `@steadyflow/shopify-admin`.
 * Catalog is real; order/inventory push APIs are readiness stubs until wired.
 */
export class ShopifySellingAdapter implements SellingPlatformAdapter {
  readonly meta = {
    id: 'shopify' as const,
    role: 'selling' as const,
    stub: false,
    capabilities: ['list_catalog', 'get_product', 'list_orders', 'list_inventory', 'push_inventory'] as const,
  };

  private cachedAudit: CatalogAuditResult | null = null;

  constructor(private readonly opts: ShopifySellingAdapterOptions) {
    if (!opts.storeUrl.trim() || !opts.adminToken.trim()) {
      throw new AdapterNotReadyError('shopify', 'storeUrl and adminToken are required');
    }
  }

  private async audit(): Promise<CatalogAuditResult> {
    if (this.cachedAudit) return this.cachedAudit;
    this.cachedAudit = await runCatalogAudit({
      storeUrl: this.opts.storeUrl,
      adminToken: this.opts.adminToken,
      printifyToken: this.opts.printifyToken,
    });
    return this.cachedAudit;
  }

  async listCatalog(): Promise<CommerceCatalog> {
    const audit = await this.audit();
    return mapShopifyAuditToCatalog(audit);
  }

  async getProduct(externalId: string): Promise<CommerceProduct | null> {
    const audit = await this.audit();
    const row = audit.rows.find((r) => r.product.id === externalId);
    if (!row) return null;
    return mapShopifyProduct(row.product, audit.shopCurrency, new Date().toISOString());
  }

  listOrders(_opts?: { since?: string; limit?: number }): Promise<CommerceOrder[]> {
    // Orders GraphQL not yet ported from Admin API — intentional readiness gap.
    return Promise.reject(new AdapterNotImplementedError('shopify', 'list_orders'));
  }

  async listInventory(): Promise<CommerceInventoryLevel[]> {
    const catalog = await this.listCatalog();
    const now = new Date().toISOString();
    const levels: CommerceInventoryLevel[] = [];
    for (const product of catalog.products) {
      for (const variant of product.variants) {
        if (!variant.sku) continue;
        const level: CommerceInventoryLevel = {
          platform: 'shopify',
          sku: variant.sku,
          externalVariantId: variant.externalId,
          available: variant.inventoryQuantity ?? 0,
          updatedAt: now,
        };
        levels.push(level);
      }
    }
    return levels;
  }

  pushInventory(_levels: CommerceInventoryLevel[]): Promise<{ updated: number }> {
    return Promise.reject(new AdapterNotImplementedError('shopify', 'push_inventory'));
  }
}

export function createShopifySellingAdapter(opts: ShopifySellingAdapterOptions): ShopifySellingAdapter {
  return new ShopifySellingAdapter(opts);
}
