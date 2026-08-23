import type { Flag } from './flags.js';
import type { ShopifyProduct } from '../shopify/schema.js';

/**
 * Marketing readiness audit.
 *
 * Deterministic checks for product discoverability across channels:
 * search (SEO title/description length), social (compare-at for sale story),
 * structured-data readiness (barcode already covered in conversion.ts), and
 * description completeness. These flags feed the marketing category insights.
 */

export type MarketingFlagCode =
  | 'marketing_no_tags'
  | 'marketing_no_description'
  | 'marketing_never_published'
  | 'marketing_no_compare_at_range';

export const MIN_DESCRIPTION_CHARS = 50;

export interface MarketingContext {
  product: ShopifyProduct;
}

export function evaluateMarketingFlags(ctx: MarketingContext): Flag[] {
  const flags: Flag[] = [];
  const product = ctx.product;

  // No tags → kills on-site search and Google Shopping feed categorization
  if (product.tags.length === 0) {
    flags.push({
      code: 'marketing_no_tags',
      severity: 'yellow',
      message: 'No tags set — hurts on-site search relevance and Google product categorization.',
    });
  }

  // No real description (just placeholder HTML / empty)
  const stripped = product.descriptionHtml.replace(/<[^>]+>/g, '').trim();
  if (stripped.length < MIN_DESCRIPTION_CHARS) {
    flags.push({
      code: 'marketing_no_description',
      severity: 'red',
      message: `Description has only ${stripped.length} visible characters (minimum ${MIN_DESCRIPTION_CHARS}).`,
    });
  }

  // Product has never been published
  if (product.publishedAt === null && product.status === 'ACTIVE') {
    flags.push({
      code: 'marketing_never_published',
      severity: 'red',
      message: 'Active product has no publishedAt date — may be hidden from the storefront.',
    });
  }

  // No compare-at price range at all
  if (!product.compareAtPriceRange) {
    flags.push({
      code: 'marketing_no_compare_at_range',
      severity: 'yellow',
      message: 'No compare-at price range — no anchor-pricing story for sale campaigns.',
    });
  }

  return flags;
}
