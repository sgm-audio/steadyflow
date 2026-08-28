import type { FlagCode } from './flags.js';

/**
 * Finding → insight metadata (single source of truth).
 *
 * Both the Node worker (`apps/edge`) and the Deno worker
 * (`supabase/functions/workers-scrape`) write audit findings as `insights`
 * rows. This module is the ONE place that maps a flag to its insight
 * category, severity, and title — so the two runtimes can never drift apart
 * on how a finding is described.
 */

/** Flag → insight category (must be a valid `InsightCategory` value). */
export const FLAG_CATEGORY: Record<FlagCode, string> = {
  low_margin: 'pricing',
  margin_negative: 'pricing',
  price_spread: 'pricing',
  on_sale: 'pricing',
  unlinked_cost: 'pricing',
  missing_alt_text: 'seo',
  no_alt_text_on_any_image: 'seo',
  missing_seo_title: 'seo',
  missing_seo_description: 'seo',
  seo_title_too_short: 'seo',
  seo_description_too_short: 'seo',
  short_description: 'conversion',
  only_one_image: 'conversion',
  missing_type_or_tags: 'seo',
  missing_weight: 'inventory',
  out_of_stock: 'inventory',
  orphaned: 'product_mix',
  no_vendor: 'product_mix',
  fx_fallback: 'trend',
  mix_undifferentiated: 'product_mix',
  mix_lopsided: 'product_mix',
  mix_single_collection: 'product_mix',
  conversion_no_barcode: 'conversion',
  conversion_no_sku: 'conversion',
  conversion_long_title: 'conversion',
  conversion_high_price_no_compare_at: 'conversion',
  inventory_low_stock: 'inventory',
  inventory_overselling: 'inventory',
  inventory_continue_when_out: 'inventory',
  marketing_no_tags: 'marketing',
  marketing_no_description: 'marketing',
  marketing_never_published: 'marketing',
  marketing_no_compare_at_range: 'marketing',
};

/** Flag → human-readable insight title. */
export const FLAG_TITLE: Record<FlagCode, string> = {
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
  mix_undifferentiated: 'Near-duplicate products (cannibalization)',
  mix_lopsided: 'Catalog dominated by one product type',
  mix_single_collection: 'All products in one collection',
  conversion_no_barcode: 'No barcode on any variant',
  conversion_no_sku: 'No SKU on any variant',
  conversion_long_title: 'Product title too long',
  conversion_high_price_no_compare_at: 'High price with no compare-at anchor',
  inventory_low_stock: 'Inventory low (≤5 units)',
  inventory_overselling: 'Tracking disabled but variants at 0 stock',
  inventory_continue_when_out: 'Inventory policy CONTINUE with 0 stock',
  marketing_no_tags: 'Products with no tags',
  marketing_no_description: 'Products with empty or very short descriptions',
  marketing_never_published: 'Active products never published',
  marketing_no_compare_at_range: 'No compare-at price range',
};

/** Flag severity (`red`/`yellow`) → insight severity (`high`/`medium`). */
export const FLAG_SEVERITY: Record<'red' | 'yellow', 'high' | 'medium'> = {
  red: 'high',
  yellow: 'medium',
};

export interface FlagInsight {
  code: FlagCode;
  category: string;
  severity: 'high' | 'medium';
  title: string;
}

/** Describe a flag for insight-row writing. */
export const describeFlag = (code: FlagCode, flagSeverity: 'red' | 'yellow'): FlagInsight => ({
  code,
  category: FLAG_CATEGORY[code],
  severity: FLAG_SEVERITY[flagSeverity],
  title: FLAG_TITLE[code],
});
