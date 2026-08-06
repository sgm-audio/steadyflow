/**
 * Deterministic rules that turn a raw Insight into the fields a client
 * report needs (confidence, remediation, effort, required access) plus the
 * report-level executive summary and sprint recommendation.
 *
 * These are derived purely from fields already on the Insight row
 * (category/severity/citations/provider) rather than stored per-insight —
 * persisting them would just be denormalization with a migration to keep
 * in sync for no benefit, since they're pure functions of existing data.
 */

import type { Insight, InsightCategory } from '../schemas/insight.js';
import type { EffortEstimate, ReportFinding } from '../schemas/report.js';

const REMEDIATION_BY_CATEGORY: Record<InsightCategory, string> = {
  pricing: 'Review pricing against competitor benchmarks and adjust margins where this finding flags a gap.',
  positioning: 'Refine product or brand messaging to close the positioning gap this finding identifies.',
  product_mix: 'Reorganize the affected catalog or collection structure to address this finding.',
  marketing: 'Update marketing copy or channels to address this finding.',
  seo: 'Add or correct the missing metadata, alt text, or structured data this finding flags.',
  conversion: 'Adjust the affected page or checkout flow to remove the friction this finding identifies.',
  inventory: 'Update the affected product or variant data (weight, stock, shipping fields) this finding flags.',
  trend: 'Monitor this trend and revisit pricing or positioning if it persists.',
};

const EFFORT_BY_CATEGORY: Record<InsightCategory, EffortEstimate> = {
  pricing: 'small',
  positioning: 'medium',
  product_mix: 'medium',
  marketing: 'medium',
  seo: 'small',
  conversion: 'medium',
  inventory: 'small',
  trend: 'small',
};

const ACCESS_BY_CATEGORY: Record<InsightCategory, string[]> = {
  pricing: ['Shopify Admin (Products)'],
  positioning: [],
  product_mix: ['Shopify Admin (Products, Collections)'],
  marketing: ['Shopify Admin (Online Store)'],
  seo: ['Shopify Admin (Online Store, Themes)'],
  conversion: ['Shopify Admin (Online Store)'],
  inventory: ['Shopify Admin (Products, Inventory)', 'Printify (optional, for cost sync)'],
  trend: [],
};

/**
 * Confidence starts at a moderate baseline and moves with the strongest
 * signals actually available on the row: cited evidence, and whether the
 * finding came from real Shopify Admin data rather than a scraped/LLM
 * heuristic pass. An uncited high-severity claim is nudged down, since
 * that's the combination most likely to be a false positive.
 */
export const computeFindingConfidence = (insight: Pick<Insight, 'citations' | 'provider' | 'severity'>): number => {
  let score = 0.55;
  if (insight.citations.length > 0) score += 0.2;
  if (insight.provider === 'shopify-admin') score += 0.15;
  if (insight.severity === 'high' && insight.citations.length === 0) score -= 0.1;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
};

export const enrichFinding = (insight: Insight): ReportFinding => ({
  ...insight,
  confidence: computeFindingConfidence(insight),
  remediation: REMEDIATION_BY_CATEGORY[insight.category],
  effortEstimate: EFFORT_BY_CATEGORY[insight.category],
  requiredAccess: ACCESS_BY_CATEGORY[insight.category],
});

export const buildExecutiveSummary = (findings: readonly Insight[]): string => {
  if (findings.length === 0) {
    return 'No findings were generated for this audit. The store may already meet the checks performed, or the analysis did not surface actionable issues.';
  }

  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byCategory = new Map<string, number>();
  for (const f of findings) {
    bySeverity[f.severity] += 1;
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
  }
  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat.replace('_', ' '));

  const parts = [
    `This audit surfaced ${findings.length} finding${findings.length === 1 ? '' : 's'} — ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low severity.`,
    `The largest concentrations are in ${topCategories.join(', ')}.`,
    bySeverity.high > 0
      ? 'The high-severity findings should be prioritized first, as they carry the most direct revenue or operational risk.'
      : 'No high-severity findings were identified; remaining items are lower-priority improvements.',
  ];
  return parts.join(' ');
};

export const buildSprintRecommendation = (findings: readonly Insight[]): string => {
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;

  if (highCount >= 3) {
    return `Recommend a fixed-price remediation sprint to address the ${highCount} high-severity findings — bundling related fixes typically completes in one sprint and de-risks the largest revenue-impacting issues first.`;
  }
  if (highCount > 0) {
    return `Recommend a scoped fix for the ${highCount} high-severity finding${highCount === 1 ? '' : 's'} rather than a full sprint — the remaining ${mediumCount} medium-severity item${mediumCount === 1 ? '' : 's'} can be addressed incrementally.`;
  }
  if (mediumCount > 0) {
    return `No sprint recommended — the ${mediumCount} medium-severity finding${mediumCount === 1 ? '' : 's'} can be self-serviced or scheduled as routine maintenance.`;
  }
  return 'No sprint recommended — findings are low-priority and can be addressed at the store owner\'s convenience.';
};
