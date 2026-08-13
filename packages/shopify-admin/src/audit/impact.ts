import type { Flag, FlagCode } from './flags.js';

/**
 * Deterministic revenue-impact estimation for the "Revenue Leak Audit".
 *
 * The engine holds read-only Shopify Admin + Printify access (no analytics), so
 * dollar impact is an ESTIMATE derived from catalog data (prices, margins,
 * counts) plus explicitly documented assumptions for traffic and conversion.
 * Values are used for RANKING (fix the $1,000/month leak before the $50 one)
 * and for the "$10k/year recoverable" guarantee check, not as accounting truth.
 */

/** Documented assumption: monthly order volume used to annualize impact. */
export const DEFAULT_MONTHLY_ORDERS = 100;

/** Documented assumption: fallback average order value when no priced products. */
export const DEFAULT_AVERAGE_ORDER_VALUE = 50;

/** Minimum margin % a healthy POD product should clear (matches flags.ts). */
export const TARGET_MARGIN_PCT = 35;

export interface LeakContext {
  currency: 'CAD' | 'USD';
  /** Mean min-variant price across priced products (store currency). */
  averageOrderValue: number;
  /** Monthly order volume — real (from read_orders) or a documented assumption. */
  monthlyOrders: number;
  productCount: number;
  /** Whether AOV / order volume came from real sales data or assumptions. */
  source: 'real' | 'assumed';
}

/** Real sales signal (AOV + order velocity) derived from recent orders. */
export interface SalesSignal {
  averageOrderValue: number;
  monthlyOrders: number;
}

export interface LeakItem {
  code: FlagCode;
  title: string;
  severity: 'high' | 'medium';
  affectedCount: number;
  /** Estimated recoverable annual revenue in the store currency (integer). */
  estimatedAnnualImpact: number;
  /** Human-readable explanation of the estimate's inputs and assumptions. */
  basis: string;
}

/**
 * Assumed fraction of annual store revenue recoverable by fixing each flag.
 * These are conservative, category-level heuristics: a speed/conversion fix
 * recovers ~1-2% of revenue; a pricing fix recovers ~3% of margin dollars.
 */
const IMPACT_COEFFICIENT: Partial<Record<FlagCode, number>> = {
  low_margin: 0.03,
  margin_negative: 0.03,
  price_spread: 0.005,
  unlinked_cost: 0.005,
  missing_alt_text: 0.01,
  no_alt_text_on_any_image: 0.01,
  missing_seo_title: 0.01,
  missing_seo_description: 0.01,
  seo_title_too_short: 0.005,
  seo_description_too_short: 0.005,
  short_description: 0.01,
  only_one_image: 0.005,
  missing_type_or_tags: 0.005,
  missing_weight: 0.01,
  out_of_stock: 0.02,
  orphaned: 0.01,
  no_vendor: 0.005,
  // Informational flags — not revenue leaks.
  on_sale: 0,
  fx_fallback: 0,
};

const FLAG_TITLE: Record<FlagCode, string> = {
  low_margin: 'Products with thin margins (<35%)',
  margin_negative: 'Products with negative margins',
  missing_alt_text: 'Product images missing alt text',
  short_description: 'Product descriptions are too short',
  missing_type_or_tags: 'Products missing type or tags',
  missing_weight: 'Variants missing weight (blocks international shipping)',
  orphaned: 'Products not in any collection',
  unlinked_cost: 'Products with no matched Printify cost',
  price_spread: 'Wide price spread across variants',
  fx_fallback: 'FX rate fetch failed during this audit',
  missing_seo_title: 'Products with no SEO title',
  missing_seo_description: 'Products with no SEO meta description',
  seo_title_too_short: 'SEO titles too short (<30 chars)',
  seo_description_too_short: 'SEO meta descriptions too short (<100 chars)',
  only_one_image: 'Products with only one image',
  no_alt_text_on_any_image: 'Products with zero alt text on any image',
  out_of_stock: 'Products that are out of stock',
  on_sale: 'Products currently on sale (compare-at pricing)',
  no_vendor: 'Products with no vendor/brand',
};

export const deriveLeakContext = (
  rows: readonly { priceMinCAD: number }[],
  currency: 'CAD' | 'USD',
  opts?: { monthlyOrders?: number; sales?: SalesSignal },
): LeakContext => {
  const priced = rows.filter((r) => r.priceMinCAD > 0).map((r) => r.priceMinCAD);
  const catalogAov = priced.length > 0
    ? priced.reduce((a, b) => a + b, 0) / priced.length
    : DEFAULT_AVERAGE_ORDER_VALUE;
  const source = opts?.sales ? 'real' : 'assumed';
  return {
    currency,
    averageOrderValue: Math.round((opts?.sales?.averageOrderValue ?? catalogAov) * 100) / 100,
    monthlyOrders: opts?.sales?.monthlyOrders ?? opts?.monthlyOrders ?? DEFAULT_MONTHLY_ORDERS,
    productCount: rows.length,
    source,
  };
};

/** Aggregate per-row flags into a map of code → { severity, affectedCount }. */
export const aggregateFlags = (
  rows: readonly { flags: readonly Flag[] }[],
): Map<FlagCode, { severity: 'high' | 'medium'; affectedCount: number }> => {
  const map = new Map<FlagCode, { severity: 'high' | 'medium'; affectedCount: number }>();
  for (const row of rows) {
    for (const flag of row.flags) {
      const severity = flag.severity === 'red' ? 'high' : 'medium';
      const entry = map.get(flag.code) ?? { severity, affectedCount: 0 };
      entry.affectedCount += 1;
      if (flag.severity === 'red') entry.severity = 'high';
      map.set(flag.code, entry);
    }
  }
  return map;
};

/**
 * Build the ranked "Leak List". Items are sorted by estimated annual impact,
 * descending, so the operator fixes the most valuable leak first.
 */
export const buildLeakList = (
  rows: readonly { priceMinCAD: number; flags: readonly Flag[] }[],
  currency: 'CAD' | 'USD',
  opts?: { monthlyOrders?: number; sales?: SalesSignal },
): LeakItem[] => {
  const context = deriveLeakContext(rows, currency, opts);
  const byFlag = aggregateFlags(rows);
  const annualBaseline = context.averageOrderValue * context.monthlyOrders * 12;
  const sourceNote = context.source === 'real'
    ? 'real order data'
    : `assumed ${context.monthlyOrders} orders/month`;

  const items: LeakItem[] = [];
  for (const [code, { severity, affectedCount }] of byFlag) {
    const coefficient = IMPACT_COEFFICIENT[code] ?? 0;
    const breadth = context.productCount > 0 ? affectedCount / context.productCount : 0;
    const estimatedAnnualImpact = Math.round(annualBaseline * coefficient * Math.min(1, breadth));
    items.push({
      code,
      title: FLAG_TITLE[code],
      severity,
      affectedCount,
      estimatedAnnualImpact,
      basis: `Baseline: $${context.averageOrderValue.toFixed(2)} AOV × ${context.monthlyOrders} orders/month (${sourceNote}) = $${Math.round(annualBaseline).toLocaleString()}/yr. Applies a ${(coefficient * 100).toFixed(1)}% recoverable-revenue share across ${affectedCount}/${context.productCount} affected products.`,
    });
  }

  return items
    .filter((i) => i.estimatedAnnualImpact > 0)
    .sort((a, b) => b.estimatedAnnualImpact - a.estimatedAnnualImpact);
};

/** Total estimated recoverable annual revenue across the leak list. */
export const totalEstimatedImpact = (items: readonly LeakItem[]): number =>
  items.reduce((sum, i) => sum + i.estimatedAnnualImpact, 0);
