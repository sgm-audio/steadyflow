import { FLAG_TITLE } from './findings.js';
import type { Flag, FlagCode } from './flags.js';
import { FLAG_TO_RUBRIC, type RubricCategoryId } from './rubric.js';

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
  /** Rubric category this flag belongs to (single source: `rubric.ts`). */
  rubricCategory: RubricCategoryId;
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
  // Mix / assortment — cannibalization is real lost revenue (rank-splitting in search)
  mix_undifferentiated: 0.02,
  mix_lopsided: 0.005,
  mix_single_collection: 0.005,
  // Conversion — barcode/sku blocks channels; long titles truncate in cart
  conversion_no_barcode: 0.01,
  conversion_no_sku: 0.005,
  conversion_long_title: 0.005,
  conversion_high_price_no_compare_at: 0.015,
  // Inventory — overselling is direct fulfillment + chargeback risk
  inventory_low_stock: 0.01,
  inventory_overselling: 0.02,
  inventory_continue_when_out: 0.015,
  // Marketing readiness — discoverability across channels
  marketing_no_tags: 0.005,
  marketing_no_description: 0.01,
  marketing_never_published: 0.02,
  marketing_no_compare_at_range: 0.005,
  // Informational flags — not revenue leaks.
  on_sale: 0,
  fx_fallback: 0,
};

export const deriveLeakContext = (
  rows: readonly { priceMinCAD: number }[],
  currency: 'CAD' | 'USD',
  opts?: { monthlyOrders?: number; sales?: SalesSignal },
): LeakContext => {
  const priced = rows.filter((r) => r.priceMinCAD > 0).map((r) => r.priceMinCAD);
  const catalogAov =
    priced.length > 0
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
  catalogFlags: readonly Flag[] = [],
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
  // Catalog-level flags contribute once each (they describe the catalog, not individual products).
  for (const flag of catalogFlags) {
    const severity = flag.severity === 'red' ? 'high' : 'medium';
    const entry = map.get(flag.code) ?? { severity, affectedCount: 0 };
    entry.affectedCount = Math.max(entry.affectedCount, 1);
    if (flag.severity === 'red') entry.severity = 'high';
    map.set(flag.code, entry);
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
  opts?: { monthlyOrders?: number; sales?: SalesSignal; catalogFlags?: readonly Flag[] },
): LeakItem[] => {
  const context = deriveLeakContext(rows, currency, opts);
  const byFlag = aggregateFlags(rows, opts?.catalogFlags ?? []);
  const annualBaseline = context.averageOrderValue * context.monthlyOrders * 12;
  const sourceNote =
    context.source === 'real' ? 'real order data' : `assumed ${context.monthlyOrders} orders/month`;

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
      rubricCategory: FLAG_TO_RUBRIC[code],
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
