import type { FlagCode } from './flags.js';

/**
 * 200-point weighted scoring rubric (12 categories) — the canonical report card.
 *
 * This is the single source of truth for how audit findings are graded. The
 * `$`-ranked leak list in `impact.ts` consumes the SAME flag→category mapping
 * here, so the report card and the dollar drill-down can never disagree about
 * which category a finding belongs to.
 *
 * Categories and weights follow the approved taxonomy (see TODO.md / S2).
 * Weights sum to exactly 200.
 */

export type RubricCategoryId =
  | 'core_web_vitals'
  | 'technical_seo'
  | 'onpage_content'
  | 'catalog_integrity'
  | 'conversion'
  | 'app_hygiene'
  | 'trust_legal'
  | 'analytics_tracking'
  | 'cost_margin'
  | 'ai_readiness'
  | 'accessibility_mobile'
  | 'platform_ops';

export interface RubricCategory {
  id: RubricCategoryId;
  label: string;
  maxPoints: number;
}

export const RUBRIC_CATEGORIES: readonly RubricCategory[] = [
  { id: 'core_web_vitals', label: 'Core Web Vitals & Performance', maxPoints: 25 },
  { id: 'technical_seo', label: 'Technical SEO', maxPoints: 22 },
  { id: 'onpage_content', label: 'On-Page Content Quality', maxPoints: 18 },
  { id: 'catalog_integrity', label: 'Catalog & Data Integrity', maxPoints: 20 },
  { id: 'conversion', label: 'Conversion Funnel / CRO', maxPoints: 25 },
  { id: 'app_hygiene', label: 'App & Script Hygiene', maxPoints: 15 },
  { id: 'trust_legal', label: 'Trust / Legal / Compliance', maxPoints: 10 },
  { id: 'analytics_tracking', label: 'Analytics & Tracking Integrity', maxPoints: 15 },
  { id: 'cost_margin', label: 'Cost / Margin Health', maxPoints: 20 },
  { id: 'ai_readiness', label: 'AI-Readiness / Agentic Commerce', maxPoints: 15 },
  { id: 'accessibility_mobile', label: 'Accessibility & Mobile UX', maxPoints: 8 },
  { id: 'platform_ops', label: 'Platform Hygiene & Ops', maxPoints: 7 },
];

export const RUBRIC_TOTAL_POINTS = RUBRIC_CATEGORIES.reduce(
  (sum, c) => sum + c.maxPoints,
  0,
);

/**
 * Canonical flag → rubric-category mapping. Consumed by BOTH the report card
 * (`scoreRubric`) and the leak list (`buildLeakList` tags each item).
 */
export const FLAG_TO_RUBRIC: Record<FlagCode, RubricCategoryId> = {
  // Cost / Margin Health
  low_margin: 'cost_margin',
  margin_negative: 'cost_margin',
  unlinked_cost: 'cost_margin',
  price_spread: 'cost_margin',
  // Technical SEO
  missing_alt_text: 'technical_seo',
  no_alt_text_on_any_image: 'technical_seo',
  missing_seo_title: 'technical_seo',
  missing_seo_description: 'technical_seo',
  seo_title_too_short: 'technical_seo',
  seo_description_too_short: 'technical_seo',
  // On-Page Content Quality
  short_description: 'onpage_content',
  only_one_image: 'onpage_content',
  marketing_no_tags: 'onpage_content',
  marketing_no_description: 'onpage_content',
  // Catalog & Data Integrity
  missing_type_or_tags: 'catalog_integrity',
  orphaned: 'catalog_integrity',
  no_vendor: 'catalog_integrity',
  mix_undifferentiated: 'catalog_integrity',
  mix_lopsided: 'catalog_integrity',
  mix_single_collection: 'catalog_integrity',
  out_of_stock: 'catalog_integrity',
  marketing_never_published: 'catalog_integrity',
  on_sale: 'catalog_integrity',
  // Conversion Funnel / CRO
  conversion_no_barcode: 'conversion',
  conversion_no_sku: 'conversion',
  conversion_long_title: 'conversion',
  conversion_high_price_no_compare_at: 'conversion',
  marketing_no_compare_at_range: 'conversion',
  // Platform Hygiene & Ops
  inventory_low_stock: 'platform_ops',
  inventory_overselling: 'platform_ops',
  inventory_continue_when_out: 'platform_ops',
  missing_weight: 'platform_ops',
  fx_fallback: 'platform_ops',
};

/**
 * Catalog-level flags describe the whole catalog rather than individual
 * products, so their breadth is 1.0 (full deduction weight) regardless of
 * `affectedCount`.
 */
const CATALOG_LEVEL_FLAGS: ReadonlySet<FlagCode> = new Set([
  'mix_lopsided',
  'mix_single_collection',
  'fx_fallback',
]);

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface CategoryScore {
  id: RubricCategoryId;
  label: string;
  maxPoints: number;
  score: number;
  /** Flags in this category that deducted points. */
  flags: FlagCode[];
}

export interface RubricResult {
  categoryScores: CategoryScore[];
  totalScore: number;
  grade: Grade;
  /** True when a critical (red) finding across ≥50% of the catalog capped the grade at C. */
  criticalCapped: boolean;
}

export const gradeFor = (total: number): Grade => {
  if (total >= 180) return 'A';
  if (total >= 160) return 'B';
  if (total >= 140) return 'C';
  if (total >= 120) return 'D';
  return 'F';
};

/** The worst grade a critical finding may still earn (critical caps at C). */
const CRITICAL_GRADE_CAP: Grade = 'C';
/** A red flag affecting ≥ this fraction of the catalog is "critical". */
const CRITICAL_BREADTH_THRESHOLD = 0.5;

const GRADE_RANK: Record<Grade, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

const capGrade = (grade: Grade): Grade =>
  GRADE_RANK[grade] > GRADE_RANK[CRITICAL_GRADE_CAP] ? CRITICAL_GRADE_CAP : grade;

/**
 * Score the 12-category rubric from aggregated audit flags.
 *
 * Each category starts at its full weight and loses points proportional to the
 * severity and catalog-breadth of the findings within it. Categories with no
 * data source (e.g. trust/legal, analytics) score at full weight — they are
 * not measured by the catalog audit and are documented as such in the report.
 */
export const scoreRubric = (
  aggregated: ReadonlyMap<FlagCode, { severity: 'high' | 'medium'; affectedCount: number }>,
  productCount: number,
): RubricResult => {
  const breadthOf = (code: FlagCode, affectedCount: number): number => {
    if (CATALOG_LEVEL_FLAGS.has(code)) return 1;
    return productCount > 0 ? Math.min(1, affectedCount / productCount) : 0;
  };

  let critical = false;
  const byCategory = new Map<RubricCategoryId, { flags: FlagCode[]; deduction: number }>();

  for (const [code, { severity, affectedCount }] of aggregated) {
    const categoryId = FLAG_TO_RUBRIC[code];
    const breadth = breadthOf(code, affectedCount);
    const severityWeight = severity === 'high' ? 1 : 0.5;
    if (severity === 'high' && breadth >= CRITICAL_BREADTH_THRESHOLD) critical = true;

    const entry = byCategory.get(categoryId) ?? { flags: [], deduction: 0 };
    entry.flags.push(code);
    entry.deduction += severityWeight * breadth;
    byCategory.set(categoryId, entry);
  }

  const categoryScores: CategoryScore[] = RUBRIC_CATEGORIES.map((cat) => {
    const entry = byCategory.get(cat.id);
    const raw = entry ? cat.maxPoints * Math.min(1, entry.deduction) : 0;
    const score = Math.round((cat.maxPoints - raw) * 100) / 100;
    return {
      id: cat.id,
      label: cat.label,
      maxPoints: cat.maxPoints,
      score,
      flags: entry?.flags ?? [],
    };
  });

  const totalScore = Math.round(categoryScores.reduce((sum, c) => sum + c.score, 0) * 100) / 100;
  const grade = critical ? capGrade(gradeFor(totalScore)) : gradeFor(totalScore);

  return { categoryScores, totalScore, grade, criticalCapped: critical && grade === CRITICAL_GRADE_CAP };
};
