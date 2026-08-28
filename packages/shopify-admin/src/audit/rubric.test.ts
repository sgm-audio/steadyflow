import { describe, it, expect } from 'vitest';
import {
  RUBRIC_CATEGORIES,
  RUBRIC_TOTAL_POINTS,
  FLAG_TO_RUBRIC,
  scoreRubric,
  gradeFor,
} from './rubric.js';
import { aggregateFlags } from './impact.js';
import type { FlagCode } from './flags.js';

const agg = (
  entries: [FlagCode, { severity: 'high' | 'medium'; affectedCount: number }][],
): Map<FlagCode, { severity: 'high' | 'medium'; affectedCount: number }> =>
  new Map(entries);

describe('rubric taxonomy', () => {
  it('weights sum to exactly 200', () => {
    expect(RUBRIC_TOTAL_POINTS).toBe(200);
    expect(RUBRIC_CATEGORIES).toHaveLength(12);
  });

  it('maps every flag to a rubric category', () => {
    // Every FlagCode must be in the mapping (compile-time via Record type);
    // spot-check a representative from each audit module.
    expect(FLAG_TO_RUBRIC.low_margin).toBe('cost_margin');
    expect(FLAG_TO_RUBRIC.missing_seo_title).toBe('technical_seo');
    expect(FLAG_TO_RUBRIC.conversion_no_barcode).toBe('conversion');
    expect(FLAG_TO_RUBRIC.inventory_overselling).toBe('platform_ops');
    expect(FLAG_TO_RUBRIC.mix_lopsided).toBe('catalog_integrity');
  });
});

describe('gradeFor', () => {
  it('applies the A-F bands', () => {
    expect(gradeFor(200)).toBe('A');
    expect(gradeFor(180)).toBe('A');
    expect(gradeFor(179)).toBe('B');
    expect(gradeFor(160)).toBe('B');
    expect(gradeFor(159)).toBe('C');
    expect(gradeFor(140)).toBe('C');
    expect(gradeFor(139)).toBe('D');
    expect(gradeFor(120)).toBe('D');
    expect(gradeFor(119)).toBe('F');
  });
});

describe('scoreRubric', () => {
  it('scores a clean store at full 200 / grade A', () => {
    const result = scoreRubric(agg([]), 10);
    expect(result.totalScore).toBe(200);
    expect(result.grade).toBe('A');
    expect(result.criticalCapped).toBe(false);
  });

  it('deducts a category proportionally to severity and breadth', () => {
    // One red low-margin product in a 10-product store → 1/10 deduction of the
    // 20-pt cost/margin category.
    const result = scoreRubric(agg([['low_margin', { severity: 'high', affectedCount: 1 }]]), 10);
    const costMargin = result.categoryScores.find((c) => c.id === 'cost_margin');
    expect(costMargin?.score).toBe(18); // 20 - (20 * 1.0 * 0.1)
    expect(result.totalScore).toBe(198);
    expect(result.grade).toBe('A');
    expect(result.criticalCapped).toBe(false);
  });

  it('caps the grade at C when a critical red finding spans ≥50% of the catalog', () => {
    const result = scoreRubric(agg([['low_margin', { severity: 'high', affectedCount: 10 }]]), 10);
    // cost_margin fully deducted → 180, but critical breadth caps grade at C.
    expect(result.totalScore).toBe(180);
    expect(result.grade).toBe('C');
    expect(result.criticalCapped).toBe(true);
  });

  it('does not cap on a medium (yellow) finding', () => {
    const result = scoreRubric(agg([['orphaned', { severity: 'medium', affectedCount: 10 }]]), 10);
    expect(result.totalScore).toBe(190); // 20 - (20 * 0.5 * 1.0)
    expect(result.grade).toBe('A');
    expect(result.criticalCapped).toBe(false);
  });

  it('integrates with aggregateFlags over audit rows', () => {
    const aggregated = aggregateFlags(
      [
        { flags: [{ code: 'low_margin' as const, severity: 'red' as const, message: 'x' }] },
        { flags: [{ code: 'low_margin' as const, severity: 'red' as const, message: 'x' }] },
      ],
      [],
    );
    const result = scoreRubric(aggregated, 2);
    expect(result.totalScore).toBe(180);
    expect(result.grade).toBe('C');
  });
});
