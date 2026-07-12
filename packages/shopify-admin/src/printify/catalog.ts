import type { PrintifyCatalogResponse } from './schema.js';

/**
 * Builds a SKU → cost (USD cents) lookup map from Printify catalog.
 * Handles fuzzy matching: exact, prefix, suffix.
 */

export interface CostLookup {
  /** Exact SKU → cost (cents USD) */
  exact: Map<string, number>;
  /** All Printify SKUs for prefix/suffix fallback matching */
  allSkus: string[];
}

export function buildCostLookup(products: PrintifyCatalogResponse[]): CostLookup {
  const exact = new Map<string, number>();
  const allSkus: string[] = [];

  for (const product of products) {
    for (const variant of product.variants) {
      if (!variant.sku) continue;
      const sku = variant.sku.trim();
      if (!sku) continue;
      // If duplicate SKU, keep the lower cost (conservative for margin)
      const existing = exact.get(sku);
      if (existing === undefined || variant.cost < existing) {
        exact.set(sku, variant.cost);
      }
      allSkus.push(sku);
    }
  }

  return { exact, allSkus };
}

/**
 * Looks up cost for a Shopify variant SKU.
 * Returns null if no match found.
 *
 * Match strategy:
 *   1. Exact match
 *   2. Printify SKU starts with Shopify SKU (e.g. "TSHIRT-001" matches "TSHIRT-001-RED-M")
 *   3. Printify SKU ends with Shopify SKU (e.g. "RED-M" matches "TSHIRT-001-RED-M")
 */
export function lookupCost(shopifySku: string, lookup: CostLookup): number | null {
  if (!shopifySku) return null;
  const sku = shopifySku.trim();
  if (!sku) return null;

  // 1. Exact
  const exact = lookup.exact.get(sku);
  if (exact !== undefined) return exact;

  // 2. Prefix: printify SKU starts with shopify SKU
  for (const pSku of lookup.allSkus) {
    if (pSku.startsWith(sku) && pSku.length > sku.length) {
      return lookup.exact.get(pSku) ?? null;
    }
  }

  // 3. Suffix: printify SKU ends with shopify SKU
  for (const pSku of lookup.allSkus) {
    if (pSku.endsWith(sku) && pSku.length > sku.length) {
      return lookup.exact.get(pSku) ?? null;
    }
  }

  return null;
}
