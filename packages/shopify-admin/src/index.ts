/**
 * Shopify Admin + Printify catalog audit — v2 library entry point.
 */

import { evaluateConversionFlags } from './audit/conversion.js';
import { evaluateFlags, summarizeFlags, type Flag } from './audit/flags.js';
import { aggregateFlags } from './audit/impact.js';
import { evaluateInventoryFlags } from './audit/inventory.js';
import { calcMargin, type Currency, type ProductMargin } from './audit/margin.js';
import { evaluateMarketingFlags } from './audit/marketing.js';
import { evaluateMixFlags } from './audit/mix.js';
import { RUBRIC_TOTAL_POINTS, scoreRubric } from './audit/rubric.js';
import { buildCostLookup, type CostLookup } from './printify/catalog.js';
import { PrintifyClient } from './printify/client.js';
import type { SalesSummary } from './shopify/client.js';
import { ShopifyClient } from './shopify/client.js';
import type { ShopifyAllCollection, ShopifyProduct, ShopifyShop } from './shopify/schema.js';
import { getUsdToCadRate } from './util/fx.js';
import { formatError } from './util/redact.js';

export interface CatalogAuditOptions {
  storeUrl: string;
  /** Legacy static admin token (deprecated by Shopify Jan 2026). */
  adminToken?: string | undefined;
  /** Dev Dashboard client ID — client credentials grant (2026 flow). */
  clientId?: string | undefined;
  /** Dev Dashboard client secret. */
  clientSecret?: string | undefined;
  /** Canonical *.myshopify.com handle (skips custom-domain DNS resolution). */
  shopDomain?: string | undefined;
  printifyToken?: string | undefined;
  fxFallback?: number | undefined;
}

export interface AuditRow {
  product: ShopifyProduct;
  margin: ProductMargin;
  flags: Flag[];
  primarySku: string;
  collectionTitles: string[];
  /** Flag codes grouped by audit module for downstream filtering. */
  flagCategories: {
    core: number;
    mix: number;
    conversion: number;
    inventory: number;
    marketing: number;
  };
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
  /** Catalog-wide flags (mix/assortment) — applied once across the catalog, not per-product. */
  catalogFlags: Flag[];
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
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text.split(' ').length : 0;
}

export async function runCatalogAudit(opts: CatalogAuditOptions): Promise<CatalogAuditResult> {
  const shopify = new ShopifyClient({
    storeUrl: opts.storeUrl,
    adminToken: opts.adminToken,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    shopDomain: opts.shopDomain,
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
    const coreFlags = evaluateFlags({ product, margin, fxFallback: fxFallbackUsed });
    const conversionFlags = evaluateConversionFlags({ product });
    const inventoryFlags = evaluateInventoryFlags({ product });
    const marketingFlags = evaluateMarketingFlags({ product });

    // Mix flags are catalog-level (computed once below), not per-row.
    const flags: Flag[] = [...coreFlags, ...conversionFlags, ...inventoryFlags, ...marketingFlags];

    const variants = product.variants.edges.map((e) => e.node);
    return {
      product,
      margin,
      flags,
      primarySku: pickPrimarySku(variants),
      collectionTitles: product.collections.edges.map((e) => e.node.title),
      flagCategories: {
        core: coreFlags.length,
        mix: 0,
        conversion: conversionFlags.length,
        inventory: inventoryFlags.length,
        marketing: marketingFlags.length,
      },
    };
  });

  // Catalog-wide flags (mix/assortment) — computed after rows exist
  const mixFlags = evaluateMixFlags({
    rows,
    collections: catalog.collections.edges.map((e) => e.node),
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
    catalogFlags: mixFlags,
    salesSummary,
  };
}

/**
 * Compute a 0-100 audit score from the rows.
 *
 * Single scoring model: the score is the 200-pt rubric normalized to 0-100.
 * There is no separate ad-hoc penalty — the rubric is the one source of truth
 * for how a store is graded, and the dashboard score is derived from it.
 */
export function computeAuditScore(rows: AuditRow[]): number {
  if (rows.length === 0) return 100;
  const aggregated = aggregateFlags(
    rows.map((r) => ({ flags: r.flags })),
    [],
  );
  const rubric = scoreRubric(aggregated, rows.length);
  return Math.round((rubric.totalScore / RUBRIC_TOTAL_POINTS) * 100);
}

/** Build a per-product findings object suitable for the product_findings table. */
export function buildProductFinding(row: AuditRow) {
  const product = row.product;
  const variants = product.variants.edges.map((e) => e.node);
  const images = product.images.edges.map((e) => e.node);
  const reds = row.flags.filter((f) => f.severity === 'red').length;
  const yellows = row.flags.filter((f) => f.severity === 'yellow').length;
  const primaryVariant = variants[0];
  const barcodeCount = variants.filter((v) => v.barcode && v.barcode.trim().length > 0).length;
  const skuCount = variants.filter((v) => v.sku && v.sku.trim().length > 0).length;

  return {
    product_id: product.id,
    handle: product.handle,
    title: product.title,
    product_type: product.productType || null,
    vendor: product.vendor || null,
    tags: product.tags,
    tag_count: product.tags.length,
    price: primaryVariant ? toNumber(primaryVariant.price) : null,
    compare_at_price: primaryVariant?.compareAtPrice
      ? toNumber(primaryVariant.compareAtPrice)
      : null,
    margin_pct: row.margin.marginPct,
    margin_cad: row.margin.marginAvg$,
    cost_cad: row.margin.costMinCAD,
    flags: row.flags.map((f) => ({ code: f.code, severity: f.severity, message: f.message })),
    flag_codes: row.flags.map((f) => f.code),
    red_flags: reds,
    yellow_flags: yellows,
    description_words: countWords(product.descriptionHtml),
    image_count: images.length,
    alt_count: images.filter((img) => (img.altText ?? '').trim().length > 0).length,
    variant_count: variants.length,
    collection_count: product.collections.edges.length,
    collection_titles: row.collectionTitles,
    sku_count: skuCount,
    barcode_count: barcodeCount,
    has_barcode: barcodeCount === variants.length && variants.length > 0,
    has_sku: skuCount === variants.length && variants.length > 0,
    seo_title_length: product.seo?.title?.length ?? null,
    seo_description_length: product.seo?.description?.length ?? null,
    is_gift_card: product.isGiftCard ?? false,
    requires_shipping: product.requiresShipping ?? true,
    status: product.status,
    published_at: product.publishedAt ?? null,
    product_updated_at: product.updatedAt ?? null,
    product_created_at: product.createdAt ?? null,
    online_store_url: product.onlineStoreUrl ?? null,
    title_length: product.title.length,
    // Flag-category breakdown for fast UI rendering of dashboard breakdown
    flag_categories: row.flagCategories,
  };
}

export type ProductFinding = ReturnType<typeof buildProductFinding>;

export { describeFlag, FLAG_CATEGORY, FLAG_SEVERITY, FLAG_TITLE } from './audit/findings.js';
export type { FlagInsight } from './audit/findings.js';
export type { Flag, FlagCode, FlagSeverity } from './audit/flags.js';
export {
  aggregateFlags,
  buildLeakList,
  DEFAULT_MONTHLY_ORDERS,
  deriveLeakContext,
  TARGET_MARGIN_PCT,
  totalEstimatedImpact,
} from './audit/impact.js';
export type { LeakContext, LeakItem } from './audit/impact.js';
export type { Currency, ProductMargin } from './audit/margin.js';
export {
  FLAG_TO_RUBRIC,
  gradeFor,
  RUBRIC_CATEGORIES,
  RUBRIC_TOTAL_POINTS,
  scoreRubric,
} from './audit/rubric.js';
export type {
  CategoryScore,
  Grade,
  RubricCategory,
  RubricCategoryId,
  RubricResult,
} from './audit/rubric.js';
export { PrintifyClient } from './printify/client.js';
export type { PrintifyShop, PrintifyVariant } from './printify/schema.js';
export { ShopifyClient } from './shopify/client.js';
export type { SalesSummary } from './shopify/client.js';
export type {
  ShopifyAllCollection,
  ShopifyCollection,
  ShopifyImage,
  ShopifyProduct,
  ShopifyShop,
  ShopifyVariant,
} from './shopify/schema.js';
export { analyzeStorefrontHtml } from './storefront.js';
export type { HostSummary, StorefrontAnalysis } from './storefront.js';
export { summarizeFlags };
