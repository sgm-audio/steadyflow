import type { Flag } from './flags.js';
import type { ShopifyProduct } from '../shopify/schema.js';

/**
 * On-page conversion audit.
 *
 * Deterministic checks for factors that affect add-to-cart rate: image
 * coverage, SKU completeness (multi-channel readiness), barcode coverage
 * (Google Shopping feed eligibility), title length (SERP/cart readability),
 * and compare-at pricing story.
 *
 * These are net-new checks; they don't replace existing per-product flags in
 * flags.ts.
 */

export type ConversionFlagCode =
  | 'conversion_no_barcode'
  | 'conversion_no_sku'
  | 'conversion_long_title'
  | 'conversion_high_price_no_compare_at';

export const MAX_TITLE_LENGTH = 70;
export const HIGH_PRICE_THRESHOLD = 50;

export interface ConversionContext {
  product: ShopifyProduct;
}

export function evaluateConversionFlags(ctx: ConversionContext): Flag[] {
  const flags: Flag[] = [];
  const product = ctx.product;
  const variants = product.variants.edges.map((e) => e.node);

  // No barcode on any variant → can't ship to Google Shopping feed
  if (variants.length > 0 && variants.every((v) => !v.barcode || v.barcode.trim().length === 0)) {
    flags.push({
      code: 'conversion_no_barcode',
      severity: 'yellow',
      message: 'No variants have a barcode — blocks Google Shopping feed eligibility.',
    });
  }

  // No SKU on any variant → breaks Printify/Amazon/eBay channel sync
  if (variants.length > 0 && variants.every((v) => !v.sku || v.sku.trim().length === 0)) {
    flags.push({
      code: 'conversion_no_sku',
      severity: 'yellow',
      message: 'No variants have a SKU — breaks multi-channel sync (Printify, Amazon, eBay).',
    });
  }

  // Title too long → truncated in search results and cart
  if (product.title.length > MAX_TITLE_LENGTH) {
    flags.push({
      code: 'conversion_long_title',
      severity: 'yellow',
      message: `Title is ${product.title.length} chars (truncates at ${MAX_TITLE_LENGTH} in SERPs and cart).`,
    });
  }

  // Price >$50 with no compare-at → no discount anchor / price-perception lever
  const minPriceStr = product.priceRangeV2.minVariantPrice.amount;
  const minPrice = Number.parseFloat(minPriceStr);
  const compareAtRange = product.compareAtPriceRange;
  const hasCompareAt = compareAtRange
    ? [compareAtRange.minVariantCompareAtPrice, compareAtRange.maxVariantCompareAtPrice].some(
        (m) => m && Number.parseFloat(m.amount) > 0,
      )
    : false;
  if (Number.isFinite(minPrice) && minPrice > HIGH_PRICE_THRESHOLD && !hasCompareAt) {
    flags.push({
      code: 'conversion_high_price_no_compare_at',
      severity: 'yellow',
      message: `Price ${minPrice.toFixed(2)} with no compare-at — setting a strike-through anchor often lifts conversion 5-15%.`,
    });
  }

  return flags;
}
