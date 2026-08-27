/**
 * Shopify Admin + Printify catalog audit — library entry point.
 *
 * Ported from the standalone `shopify-printify-audit` CLI
 * (/home/sgm/Desktop/Dev/Making Madi). Unlike the CLI, this is a pure
 * function: no env reading, no file writes, no console output — the caller
 * supplies already-unwrapped tokens and gets structured data back.
 */

import { ShopifyClient } from './shopify/client.js';
import { CATALOG_QUERY } from './shopify/queries.js';
import type { ShopifyProduct, ShopifyAllCollection } from './shopify/schema.js';
import { PrintifyClient } from './printify/client.js';
import { buildCostLookup, type CostLookup } from './printify/catalog.js';
import { getUsdToCadRate } from './util/fx.js';
import { calcMargin, type Currency, type ProductMargin } from './audit/margin.js';
import { evaluateFlags, summarizeFlags, type Flag } from './audit/flags.js';
import { formatError } from './util/redact.js';

export interface CatalogAuditOptions {
  storeUrl: string;
  adminToken: string;
  /** Omit or leave empty to skip Printify cost matching (all costs flagged manual). */
  printifyToken?: string | undefined;
  /** USD→CAD fallback rate if the live FX fetch fails. Default 1.37. */
  fxFallback?: number | undefined;
}

export interface AuditRow {
  product: ShopifyProduct;
  margin: ProductMargin;
  flags: Flag[];
  primarySku: string;
  collectionTitles: string[];
}

export interface CatalogAuditResult {
  shopCurrency: Currency;
  fxRate: number;
  fxSource: 'live' | 'fallback';
  printifyEnabled: boolean;
  rows: AuditRow[];
  collections: ShopifyAllCollection[];
  totalProducts: number;
  totalCollections: number;
}

function pickPrimarySku(variants: readonly { sku?: string | null | undefined }[]): string {
  for (const v of variants) {
    if (v.sku?.trim()) return v.sku.trim();
  }
  return '';
}

/**
 * Fetch the full Shopify catalog, join against Printify costs (if a token is
 * given), compute per-product margin, and evaluate content-quality flags.
 * Read-only — makes no mutating calls to either API.
 */
export async function runCatalogAudit(opts: CatalogAuditOptions): Promise<CatalogAuditResult> {
  const shopify = new ShopifyClient({ storeUrl: opts.storeUrl, adminToken: opts.adminToken });
  const catalog = await shopify.fetchCatalog(CATALOG_QUERY);

  const rawCurrency = catalog.shop.currencyCode;
  if (rawCurrency !== 'CAD' && rawCurrency !== 'USD') {
    throw new Error(`Unsupported shop currency: ${rawCurrency}. Only CAD and USD are supported.`);
  }
  const shopCurrency: Currency = rawCurrency;

  let fxRate = 1;
  let fxSource: 'live' | 'fallback' = 'live';
  let fxFallbackUsed = false;
  if (shopCurrency === 'USD') {
    const fx = await getUsdToCadRate(opts.fxFallback ?? 1.37);
    fxRate = fx.rate;
    fxSource = fx.source;
    fxFallbackUsed = fx.source === 'fallback';
  }

  let costLookup: CostLookup | null = null;
  const printifyEnabled = Boolean(opts.printifyToken);
  if (printifyEnabled && opts.printifyToken) {
    try {
      const printify = new PrintifyClient(opts.printifyToken);
      const shops = await printify.listShops();
      const shop = shops[0];
      if (shop) {
        const products = await printify.fetchShopCatalog(shop.id);
        costLookup = buildCostLookup(products);
      }
    } catch (err) {
      // Costs will be flagged manual (unlinked_cost) — don't fail the whole audit.
      console.warn(`[shopify-admin] Printify fetch failed: ${formatError(err)}`);
      costLookup = null;
    }
  }

  const rows: AuditRow[] = catalog.products.edges.map(({ node: product }) => {
    const margin = calcMargin(product, { shopCurrency, fxRate, costLookup });
    const flags = evaluateFlags({ product, margin, fxFallback: fxFallbackUsed });
    const variants = product.variants.edges.map((e) => e.node);
    return {
      product,
      margin,
      flags,
      primarySku: pickPrimarySku(variants),
      collectionTitles: product.collections.edges.map((e) => e.node.title),
    };
  });

  return {
    shopCurrency,
    fxRate,
    fxSource,
    printifyEnabled,
    rows,
    collections: catalog.collections.edges.map((e) => e.node),
    totalProducts: catalog.products.edges.length,
    totalCollections: catalog.collections.edges.length,
  };
}

export { summarizeFlags };
export type { Flag, FlagCode, FlagSeverity } from './audit/flags.js';
export type { ProductMargin, Currency } from './audit/margin.js';
export type { ShopifyProduct, ShopifyVariant, ShopifyImage, ShopifyCollection, ShopifyAllCollection } from './shopify/schema.js';
export type { PrintifyShop, PrintifyVariant } from './printify/schema.js';
export { ShopifyClient } from './shopify/client.js';
export { PrintifyClient } from './printify/client.js';
