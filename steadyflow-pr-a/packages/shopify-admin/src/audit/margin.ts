import type { ShopifyProduct, ShopifyVariant } from '../shopify/schema.js';
import type { CostLookup } from '../printify/catalog.js';
import { lookupCost } from '../printify/catalog.js';

export type Currency = 'CAD' | 'USD';

export interface ProductMargin {
  /** Min variant price in CAD */
  priceMinCAD: number;
  /** Max variant price in CAD */
  priceMaxCAD: number;
  /** Min Printify cost in CAD (null if no variants linked) */
  costMinCAD: number | null;
  /** Max Printify cost in CAD (null if no variants linked) */
  costMaxCAD: number | null;
  /** Average margin in CAD across matched variants (null if none matched) */
  marginAvg$: number | null;
  /** Average margin % across matched variants (null if none matched) */
  marginPct: number | null;
  /** Best-case margin (max price - min cost) in CAD */
  marginBest$: number | null;
  /** Worst-case margin (min price - max cost) in CAD */
  marginWorst$: number | null;
  /** SKUs that failed to match in Printify */
  unlinkedVariants: string[];
  /** Number of variants that matched Printify */
  matchedVariants: number;
  /** Total number of variants */
  totalVariants: number;
}

export interface MarginContext {
  shopCurrency: Currency;
  fxRate: number;
  costLookup: CostLookup | null;
}

function toCents(amount: string): number {
  // Shopify returns decimal string like "24.99"
  return Math.round(parseFloat(amount) * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

function convertToCAD(cents: number, ctx: MarginContext): number {
  if (ctx.shopCurrency === 'CAD') return fromCents(cents);
  // USD → CAD
  return fromCents(Math.round(cents * ctx.fxRate));
}

export function calcMargin(
  product: ShopifyProduct,
  ctx: MarginContext,
): ProductMargin {
  const variants: ShopifyVariant[] = product.variants.edges.map((e) => e.node);

  // Price range (already in shop currency)
  const priceMinCents = toCents(product.priceRangeV2.minVariantPrice.amount);
  const priceMaxCents = toCents(product.priceRangeV2.maxVariantPrice.amount);
  const priceMinCAD = convertToCAD(priceMinCents, ctx);
  const priceMaxCAD = convertToCAD(priceMaxCents, ctx);

  // No Printify lookup → no cost data
  if (!ctx.costLookup) {
    return {
      priceMinCAD,
      priceMaxCAD,
      costMinCAD: null,
      costMaxCAD: null,
      marginAvg$: null,
      marginPct: null,
      marginBest$: null,
      marginWorst$: null,
      unlinkedVariants: variants.map((v) => v.sku ?? '').filter(Boolean),
      matchedVariants: 0,
      totalVariants: variants.length,
    };
  }

  // Per-variant cost lookup
  const variantCosts: { variant: ShopifyVariant; costCAD: number | null }[] = [];
  const unlinked: string[] = [];

  for (const v of variants) {
    if (!v.sku) {
      unlinked.push(`(no-sku:${v.title})`);
      variantCosts.push({ variant: v, costCAD: null });
      continue;
    }
    const costCents = lookupCost(v.sku, ctx.costLookup);
    if (costCents === null) {
      unlinked.push(v.sku);
      variantCosts.push({ variant: v, costCAD: null });
    } else {
      const costCAD = convertToCAD(costCents, ctx);
      variantCosts.push({ variant: v, costCAD });
    }
  }

  const matchedCosts = variantCosts
    .filter((vc): vc is { variant: ShopifyVariant; costCAD: number } => vc.costCAD !== null)
    .map((vc) => vc.costCAD);

  if (matchedCosts.length === 0) {
    return {
      priceMinCAD,
      priceMaxCAD,
      costMinCAD: null,
      costMaxCAD: null,
      marginAvg$: null,
      marginPct: null,
      marginBest$: null,
      marginWorst$: null,
      unlinkedVariants: unlinked,
      matchedVariants: 0,
      totalVariants: variants.length,
    };
  }

  const costMinCAD = Math.min(...matchedCosts);
  const costMaxCAD = Math.max(...matchedCosts);

  // Per-variant margin (price - cost) for matched variants
  const variantPrices = variantCosts
    .filter((vc) => vc.costCAD !== null)
    .map((vc) => convertToCAD(toCents(vc.variant.price), ctx));

  const margins = variantPrices.map((price, i) => {
    const cost = matchedCosts[i];
    return cost === undefined ? 0 : price - cost;
  });

  const marginAvg$ = margins.reduce((a, b) => a + b, 0) / margins.length;
  const avgPrice = variantPrices.reduce((a, b) => a + b, 0) / variantPrices.length;
  const marginPct = avgPrice > 0 ? (marginAvg$ / avgPrice) * 100 : 0;

  const marginBest$ = priceMaxCAD - costMinCAD;
  const marginWorst$ = priceMinCAD - costMaxCAD;

  return {
    priceMinCAD,
    priceMaxCAD,
    costMinCAD,
    costMaxCAD,
    marginAvg$,
    marginPct,
    marginBest$,
    marginWorst$,
    unlinkedVariants: unlinked,
    matchedVariants: matchedCosts.length,
    totalVariants: variants.length,
  };
}
