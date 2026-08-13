/**
 * Shopify Admin + Printify catalog audit — v2 library entry point.
 */

import { ShopifyClient } from './shopify/client.js';
import type { SalesSummary } from './shopify/client.js';
import type { ShopifyProduct, ShopifyAllCollection, ShopifyShop } from './shopify/schema.js';
import { PrintifyClient } from './printify/client.js';
import { buildCostLookup, type CostLookup } from './printify/catalog.js';
import { getUsdToCadRate } from './util/fx.js';
import { calcMargin, type Currency, type ProductMargin } from './audit/margin.js';
import { evaluateFlags, summarizeFlags, type Flag } from './audit/flags.js';
import { formatError } from './util/redact.js';

export interface CatalogAuditOptions {
  storeUrl: string;
  /** Legacy static admin token (deprecated by Shopify Jan 2026). */
  adminToken?: string | undefined;
  /** Dev Dashboard client ID — client credentials grant (2026 flow). */
  clientId?: string | undefined;
  /** Dev Dashboard client secret. */
  clientSecret?: string | undefined;
  printifyToken?: string | undefined;
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
  shop: ShopifyShop;
  fxRate: number;
  fxSource: 'live' | 'fallback';
  printifyEnabled: boolean;
  rows: AuditRow[];
  collections: ShopifyAllCollection[];
  totalProducts: number;
  totalCollections: number;
  /** Real sales signal (recent orders) when `read_orders` is granted; null otherwise. */
  salesSummary: SalesSummary | null;
}

function pickPrimarySku(variants: readonly { sku?: string | null | undefined }[]): string {
  for (const v of variants) {
    if (v.sku?.trim()) return v.sku.trim();
  }
  return '';
}

function toNumber(amount: string): number {
  const n = parseFloat(amount);
  return Number.isFinite(n) ? n : 0;
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text.split(' ').length : 0;
}

export async function runCatalogAudit(opts: CatalogAuditOptions): Promise<CatalogAuditResult> {
  const shopify = new ShopifyClient({
    storeUrl: opts.storeUrl,
    adminToken: opts.adminToken,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
  });
  const catalog = await shopify.fetchCatalog();

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
      console.warn(`[shopify-admin] Printify fetch failed: ${formatError(err)}`);
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

  // Best-effort real sales signal; null when read_orders isn't granted.
  const salesSummary = await shopify.fetchSalesSummary();

  return {
    shopCurrency,
    shop: catalog.shop,
    fxRate,
    fxSource,
    printifyEnabled,
    rows,
    collections: catalog.collections.edges.map((e) => e.node),
    totalProducts: catalog.products.edges.length,
    totalCollections: catalog.collections.edges.length,
    salesSummary,
  };
}

/** Compute a 0-100 audit score from the rows. */
export function computeAuditScore(rows: AuditRow[]): number {
  if (rows.length === 0) return 100;
  let penalty = 0;
  const maxPenalty = rows.length * 10;
  for (const row of rows) {
    const reds = row.flags.filter((f) => f.severity === 'red').length;
    const yellows = row.flags.filter((f) => f.severity === 'yellow').length;
    penalty += reds * 3 + yellows;
  }
  const raw = Math.max(0, 100 - Math.round((penalty / maxPenalty) * 100));
  return raw;
}

/** Build a per-product findings object suitable for the product_findings table. */
export function buildProductFinding(row: AuditRow) {
  const product = row.product;
  const variants = product.variants.edges.map((e) => e.node);
  const images = product.images.edges.map((e) => e.node);
  const reds = row.flags.filter((f) => f.severity === 'red').length;
  const yellows = row.flags.filter((f) => f.severity === 'yellow').length;
  const primaryVariant = variants[0];

  return {
    product_id: product.id,
    handle: product.handle,
    title: product.title,
    product_type: product.productType || null,
    vendor: product.vendor || null,
    price: primaryVariant ? toNumber(primaryVariant.price) : null,
    compare_at_price: primaryVariant?.compareAtPrice ? toNumber(primaryVariant.compareAtPrice) : null,
    margin_pct: row.margin.marginPct,
    margin_cad: row.margin.marginAvg$,
    cost_cad: row.margin.costMinCAD,
    flags: row.flags.map((f) => ({ code: f.code, severity: f.severity, message: f.message })),
    red_flags: reds,
    yellow_flags: yellows,
    description_words: countWords(product.descriptionHtml),
    image_count: images.length,
    alt_count: images.filter((img) => (img.altText ?? '').trim().length > 0).length,
    variant_count: variants.length,
    total_inventory: product.totalInventory ?? null,
    available_for_sale: product.availableForSale ?? null,
    collection_count: product.collections.edges.length,
    seo_title_length: product.seo?.title?.length ?? null,
    seo_description_length: product.seo?.description?.length ?? null,
  };
}

export type ProductFinding = ReturnType<typeof buildProductFinding>;

export { summarizeFlags };
export type { Flag, FlagCode, FlagSeverity } from './audit/flags.js';
export type { ProductMargin, Currency } from './audit/margin.js';
export {
  buildLeakList,
  deriveLeakContext,
  aggregateFlags,
  totalEstimatedImpact,
  DEFAULT_MONTHLY_ORDERS,
  TARGET_MARGIN_PCT,
} from './audit/impact.js';
export type { LeakContext, LeakItem } from './audit/impact.js';
export { analyzeStorefrontHtml } from './storefront.js';
export type { StorefrontAnalysis, HostSummary } from './storefront.js';
export type {
  ShopifyProduct, ShopifyVariant, ShopifyImage,
  ShopifyCollection, ShopifyAllCollection, ShopifyShop,
} from './shopify/schema.js';
export type { PrintifyShop, PrintifyVariant } from './printify/schema.js';
export { ShopifyClient } from './shopify/client.js';
export type { SalesSummary } from './shopify/client.js';
export { PrintifyClient } from './printify/client.js';
