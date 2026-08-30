import type { AuditRow } from '../index.js';
import type { Flag } from './flags.js';

/**
 * Product mix / assortment audit.
 *
 * Deterministic checks that look at the catalog shape rather than individual
 * products: cannibalization (near-duplicate titles), assortment lopsidedness
 * (one product type dominates), and merchandising concentration (single
 * collection). Net-new flags; does not duplicate codes from flags.ts.
 */

export type MixFlagCode = 'mix_undifferentiated' | 'mix_lopsided' | 'mix_single_collection';

interface MixInput {
  rows: AuditRow[];
  collections: { title: string }[];
}

export interface MixContext {
  rows: AuditRow[];
  collections: { title: string }[];
}

/** Title normalization for cannibalization detection. Strips trailing size/color and lowercases. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(xs|s|m|l|xl|xxl|xxxl)\b/g, '')
    .replace(/\b(black|white|red|blue|green|yellow|pink|purple|grey|gray|silver|gold)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detect products that are likely variants of the same SKU listed separately (cannibalization). */
export const detectUndifferentiatedProducts = (rows: AuditRow[]): string[][] => {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const norm = normalizeTitle(row.product.title);
    if (norm.length < 5) continue;
    const list = groups.get(norm) ?? [];
    list.push(row.product.title);
    groups.set(norm, list);
  }
  return [...groups.values()].filter((titles) => titles.length >= 2);
};

/** Detect catalogs where >80% of products are a single product type (assortment lopsidedness). */
export const detectLopsidedAssortment = (
  rows: AuditRow[],
): { dominantType: string; sharePct: number } | null => {
  if (rows.length < 5) return null;
  const typeCounts = new Map<string, number>();
  for (const row of rows) {
    const t = row.product.productType.trim() || '(none)';
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const total = rows.length;
  let maxType = '';
  let maxCount = 0;
  for (const [t, c] of typeCounts) {
    if (c > maxCount) {
      maxCount = c;
      maxType = t;
    }
  }
  const sharePct = (maxCount / total) * 100;
  if (sharePct < 80) return null;
  return { dominantType: maxType, sharePct };
};

/** Detect catalogs where all products live in a single collection (poor merchandising). */
export const detectSingleCollectionConcentration = (rows: AuditRow[]): string | null => {
  if (rows.length === 0) return null;
  const collCounts = new Map<string, number>();
  for (const row of rows) {
    const colls = row.product.collections.edges.map((e) => e.node.title);
    if (colls.length === 0) continue;
    const primary = colls[0];
    if (primary === undefined) continue;
    collCounts.set(primary, (collCounts.get(primary) ?? 0) + 1);
  }
  if (collCounts.size === 0) return null;
  const total = rows.length;
  for (const [coll, count] of collCounts) {
    if (count / total >= 0.95 && collCounts.size === 1) return coll;
  }
  return null;
};

export function evaluateMixFlags(ctx: MixInput): Flag[] {
  const flags: Flag[] = [];
  const dupes = detectUndifferentiatedProducts(ctx.rows);
  if (dupes.length > 0) {
    const titles = dupes.flat().slice(0, 6);
    const more = dupes.flat().length - titles.length;
    flags.push({
      code: 'mix_undifferentiated',
      severity: dupes.length >= 5 ? 'red' : 'yellow',
      message: `${dupes.length} cluster(s) of near-duplicate titles (cannibalization risk): ${titles.join(', ')}${more > 0 ? ` + ${more} more` : ''}.`,
    });
  }

  const lopsided = detectLopsidedAssortment(ctx.rows);
  if (lopsided) {
    flags.push({
      code: 'mix_lopsided',
      severity: 'yellow',
      message: `${lopsided.sharePct.toFixed(0)}% of catalog is a single product type ("${lopsided.dominantType}"). Diversifying reduces single-channel risk.`,
    });
  }

  const singleColl = detectSingleCollectionConcentration(ctx.rows);
  if (singleColl) {
    flags.push({
      code: 'mix_single_collection',
      severity: 'yellow',
      message: `95%+ of products live in one collection ("${singleColl}"). Multi-collection merchandising improves discoverability.`,
    });
  }

  return flags;
}
