import type { ShopifyProduct } from '../shopify/schema.js';
import type { ProductMargin } from './margin.js';
import { descriptionWordCount } from '../util/html.js';

export type FlagCode =
  | 'low_margin'
  | 'margin_negative'
  | 'missing_alt_text'
  | 'short_description'
  | 'missing_type_or_tags'
  | 'missing_weight'
  | 'orphaned'
  | 'unlinked_cost'
  | 'price_spread'
  | 'fx_fallback'
  | 'missing_seo_title'
  | 'missing_seo_description'
  | 'seo_title_too_short'
  | 'seo_description_too_short'
  | 'only_one_image'
  | 'no_alt_text_on_any_image'
  | 'out_of_stock'
  | 'on_sale'
  | 'no_vendor';

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

  // 10. margin_negative
  if (margin.marginPct !== null && margin.marginPct < 0) {
    flags.push({
      code: 'margin_negative',
      severity: 'red',
      message: `Negative margin (${margin.marginPct.toFixed(1)}%) — price is below cost`,
    });
  }

  // 11. missing_seo_title
  const seoTitle = product.seo?.title ?? '';
  if (seoTitle.length > 0 && seoTitle.trim().length === 0) {
    flags.push({ code: 'missing_seo_title', severity: 'yellow', message: 'No SEO title set' });
  }

  // 12. missing_seo_description
  const seoDescription = product.seo?.description ?? '';
  if (seoDescription.length > 0 && seoDescription.trim().length === 0) {
    flags.push({ code: 'missing_seo_description', severity: 'yellow', message: 'No SEO description set' });
  }

  // 13. seo_title_too_short
  if (product.seo?.title && product.seo.title.trim().length > 0 && product.seo.title.trim().length < 30) {
    flags.push({ code: 'seo_title_too_short', severity: 'yellow', message: `SEO title is ${product.seo.title.trim().length} characters (aim for 50-60)` });
  }

  // 14. seo_description_too_short
  if (product.seo?.description && product.seo.description.trim().length > 0 && product.seo.description.trim().length < 100) {
    flags.push({ code: 'seo_description_too_short', severity: 'yellow', message: `SEO description is ${product.seo.description.trim().length} characters (aim for 120-160)` });
  }

  // 15. only_one_image
  if (images.length === 1) {
    flags.push({ code: 'only_one_image', severity: 'yellow', message: 'Only one product image — 3+ images improve conversion' });
  }

  // 16. no_alt_text_on_any_image
  if (images.length > 0 && missingAltImages.length === images.length) {
    flags.push({ code: 'no_alt_text_on_any_image', severity: 'red', message: `All ${images.length} image(s) have no alt text` });
  }

  // 17. out_of_stock — derived from variant availability (product-level
  // availableForSale/totalInventory require read_inventory, which may be
  // absent under a read_products-only scope).
  const allVariantsUnavailable = variants.length > 0 && variants.every((v) => v.availableForSale === false);
  if (allVariantsUnavailable) {
    flags.push({ code: 'out_of_stock', severity: 'red', message: 'Product is out of stock' });
  }

  // 18. on_sale
  const hasCompareAt = variants.some((v) => v.compareAtPrice && parseFloat(v.compareAtPrice) > 0);
  if (hasCompareAt) {
    flags.push({ code: 'on_sale', severity: 'yellow', message: 'Product has a compare-at (sale) price set' });
  }

  // 19. no_vendor
  if (!product.vendor || product.vendor.trim().length === 0) {
    flags.push({ code: 'no_vendor', severity: 'yellow', message: 'No vendor/brand set' });
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
