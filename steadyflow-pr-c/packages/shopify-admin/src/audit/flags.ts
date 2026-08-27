import type { ShopifyProduct } from '../shopify/schema.js';
import type { ProductMargin } from './margin.js';
import { descriptionWordCount } from '../util/html.js';

export type FlagCode =
  | 'low_margin'
  | 'missing_alt_text'
  | 'short_description'
  | 'missing_type_or_tags'
  | 'missing_weight'
  | 'orphaned'
  | 'unlinked_cost'
  | 'price_spread'
  | 'fx_fallback';

export type FlagSeverity = 'red' | 'yellow';

export interface Flag {
  code: FlagCode;
  severity: FlagSeverity;
  message: string;
}

export interface AuditContext {
  product: ShopifyProduct;
  margin: ProductMargin;
  fxFallback: boolean;
}

const MIN_MARGIN_PCT = 35;
const MIN_DESCRIPTION_WORDS = 80;
const PRICE_SPREAD_THRESHOLD = 0.5;

function isMissingAlt(alt: string | null | undefined): boolean {
  if (alt === null || alt === undefined) return true;
  return alt.trim().length === 0;
}

export function evaluateFlags(ctx: AuditContext): Flag[] {
  const flags: Flag[] = [];
  const { product, margin, fxFallback } = ctx;

  // 1. low_margin
  if (margin.marginPct !== null && margin.marginPct < MIN_MARGIN_PCT) {
    flags.push({
      code: 'low_margin',
      severity: 'red',
      message: `Margin ${margin.marginPct.toFixed(1)}% is below ${MIN_MARGIN_PCT}% threshold`,
    });
  }

  // 2. missing_alt_text
  const images = product.images.edges.map((e) => e.node);
  const missingAltImages = images.filter((img) => isMissingAlt(img.altText));
  if (images.length > 0 && missingAltImages.length > 0) {
    flags.push({
      code: 'missing_alt_text',
      severity: 'red',
      message: `${missingAltImages.length}/${images.length} image(s) missing alt text`,
    });
  } else if (images.length === 0) {
    flags.push({
      code: 'missing_alt_text',
      severity: 'red',
      message: 'No images at all',
    });
  }

  // 3. short_description
  const wordCount = descriptionWordCount(product.descriptionHtml);
  if (wordCount < MIN_DESCRIPTION_WORDS) {
    flags.push({
      code: 'short_description',
      severity: 'red',
      message: `Description has ${wordCount} words (minimum ${MIN_DESCRIPTION_WORDS})`,
    });
  }

  // 4. missing_type_or_tags
  const hasType = product.productType.trim().length > 0;
  const hasTags = product.tags.length > 0;
  if (!hasType && !hasTags) {
    flags.push({
      code: 'missing_type_or_tags',
      severity: 'red',
      message: 'Missing both product type and tags',
    });
  } else if (!hasType) {
    flags.push({
      code: 'missing_type_or_tags',
      severity: 'red',
      message: 'Missing product type',
    });
  } else if (!hasTags) {
    flags.push({
      code: 'missing_type_or_tags',
      severity: 'red',
      message: 'Missing tags',
    });
  }

  // 5. missing_weight
  const variants = product.variants.edges.map((e) => e.node);
  const missingWeight = variants.filter(
    (v) => v.weight === null || v.weight === undefined || v.weight === 0,
  );
  if (variants.length > 0 && missingWeight.length > 0) {
    flags.push({
      code: 'missing_weight',
      severity: 'red',
      message: `${missingWeight.length}/${variants.length} variant(s) missing weight (blocks intl shipping)`,
    });
  }

  // 6. orphaned
  if (product.collections.edges.length === 0) {
    flags.push({
      code: 'orphaned',
      severity: 'yellow',
      message: 'Product is not in any collection',
    });
  }

  // 7. unlinked_cost
  if (margin.unlinkedVariants.length > 0 && margin.unlinkedVariants.length === variants.length) {
    flags.push({
      code: 'unlinked_cost',
      severity: 'yellow',
      message: `No Printify cost match for any variant (${margin.unlinkedVariants.length} variants)`,
    });
  } else if (margin.unlinkedVariants.length > 0) {
    flags.push({
      code: 'unlinked_cost',
      severity: 'yellow',
      message: `${margin.unlinkedVariants.length}/${variants.length} variant(s) unlinked to Printify`,
    });
  }

  // 8. price_spread
  if (margin.priceMaxCAD > 0 && margin.priceMinCAD > 0) {
    const spread = (margin.priceMaxCAD - margin.priceMinCAD) / margin.priceMinCAD;
    if (spread > PRICE_SPREAD_THRESHOLD) {
      flags.push({
        code: 'price_spread',
        severity: 'yellow',
        message: `Price spread ${(spread * 100).toFixed(0)}% exceeds ${(PRICE_SPREAD_THRESHOLD * 100).toFixed(0)}% threshold`,
      });
    }
  }

  // 9. fx_fallback
  if (fxFallback) {
    flags.push({
      code: 'fx_fallback',
      severity: 'yellow',
      message: 'FX rate fetch failed; using fallback rate',
    });
  }

  return flags;
}

export function summarizeFlags(flags: Flag[]): { red: number; yellow: number } {
  let red = 0;
  let yellow = 0;
  for (const f of flags) {
    if (f.severity === 'red') red++;
    else yellow++;
  }
  return { red, yellow };
}
