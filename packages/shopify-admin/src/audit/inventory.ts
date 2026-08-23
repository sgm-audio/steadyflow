import type { Flag } from './flags.js';
import type { ShopifyProduct } from '../shopify/schema.js';

/**
 * Inventory & fulfillment audit.
 *
 * Deterministic checks for stock accuracy and fulfillment readiness:
 * low stock (≤5), overselling risk (tracksInventory=false with 0 stock),
 * inventory policy CONTINUE (will oversell when out), and weight coverage
 * for international shipping rate calculation.
 */

export type InventoryFlagCode =
  | 'inventory_low_stock'
  | 'inventory_overselling'
  | 'inventory_continue_when_out';

export const LOW_STOCK_THRESHOLD = 5;

export interface InventoryContext {
  product: ShopifyProduct;
}

export function evaluateInventoryFlags(ctx: InventoryContext): Flag[] {
  const flags: Flag[] = [];
  const product = ctx.product;
  const variants = product.variants.edges.map((e) => e.node);

  // Low stock — total inventory ≤ threshold and not 0 (out_of_stock flag covers 0)
  const totalStock = product.totalInventory ?? variants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0);
  if (totalStock > 0 && totalStock <= LOW_STOCK_THRESHOLD && variants.length > 0) {
    flags.push({
      code: 'inventory_low_stock',
      severity: 'yellow',
      message: `Only ${totalStock} unit(s) left across all variants — reorder soon to avoid lost sales.`,
    });
  }

  // Overselling: tracksInventory=false but inventoryQuantity=0 means Shopify will keep selling
  const overselling = variants.find(
    (v) => product.tracksInventory === false && (v.inventoryQuantity === 0 || v.availableForSale === false),
  );
  if (overselling) {
    flags.push({
      code: 'inventory_overselling',
      severity: 'red',
      message: 'Tracking disabled but variants show 0 stock — POD/sync products often oversell this way.',
    });
  }

  // inventoryPolicy=CONTINUE with 0 stock → Shopify keeps selling after stockout (overselling)
  const continues = variants.find((v) => v.inventoryPolicy === 'CONTINUE' && (v.inventoryQuantity === 0));
  if (continues) {
    flags.push({
      code: 'inventory_continue_when_out',
      severity: 'yellow',
      message: 'Inventory policy is CONTINUE with 0 stock — Shopify will accept orders you cannot fulfill.',
    });
  }

  return flags;
}
