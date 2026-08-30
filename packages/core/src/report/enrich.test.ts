import { describe, expect, it } from 'vitest';
import { Insight } from '../schemas/insight.js';
import {
  buildExecutiveSummary,
  buildSprintRecommendation,
  computeFindingConfidence,
  enrichFinding,
} from './enrich.js';

const makeInsight = (overrides: Partial<Parameters<typeof Insight.parse>[0]> = {}) =>
  Insight.parse({
    id: '00000000-0000-4000-8000-000000000001',
    category: 'seo',
    severity: 'medium',
    title: 'Missing alt text',
    body: 'Several product images are missing alt text.',
    citations: [],
    model: 'deepseek-chat',
    provider: 'deepseek',
    generatedAt: new Date().toISOString(),
    ...overrides,
  });

describe('computeFindingConfidence', () => {
  it('returns the baseline for an uncited, non-shopify-admin, non-high finding', () => {
    const score = computeFindingConfidence(makeInsight({ severity: 'medium' }));
    expect(score).toBe(0.55);
  });

  it('increases confidence when citations are present', () => {
    const score = computeFindingConfidence(
      makeInsight({
        severity: 'medium',
        citations: [{ sourceId: '00000000-0000-4000-8000-000000000002' }],
      }),
    );
    expect(score).toBe(0.75);
  });

  it('increases confidence for shopify-admin-sourced findings', () => {
    const score = computeFindingConfidence(
      makeInsight({ severity: 'medium', provider: 'shopify-admin' }),
    );
    expect(score).toBe(0.7);
  });

  it('penalizes an uncited high-severity finding', () => {
    const score = computeFindingConfidence(makeInsight({ severity: 'high', citations: [] }));
    expect(score).toBe(0.45);
  });

  it('does not penalize a cited high-severity finding', () => {
    const score = computeFindingConfidence(
      makeInsight({
        severity: 'high',
        citations: [{ sourceId: '00000000-0000-4000-8000-000000000002' }],
      }),
    );
    expect(score).toBe(0.75);
  });

  it('clamps to [0, 1]', () => {
    const score = computeFindingConfidence(
      makeInsight({
        severity: 'medium',
        provider: 'shopify-admin',
        citations: [{ sourceId: '00000000-0000-4000-8000-000000000002' }],
      }),
    );
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('enrichFinding', () => {
  it('adds confidence, remediation, effortEstimate, and requiredAccess to every category', () => {
    const categories = [
      'pricing',
      'positioning',
      'product_mix',
      'marketing',
      'seo',
      'conversion',
      'inventory',
      'trend',
    ] as const;
    for (const category of categories) {
      const finding = enrichFinding(makeInsight({ category }));
      expect(finding.confidence).toBeGreaterThanOrEqual(0);
      expect(finding.remediation.length).toBeGreaterThan(0);
      expect(['small', 'medium', 'large']).toContain(finding.effortEstimate);
      expect(Array.isArray(finding.requiredAccess)).toBe(true);
      // Original insight fields pass through untouched.
      expect(finding.id).toBe('00000000-0000-4000-8000-000000000001');
      expect(finding.category).toBe(category);
    }
  });

  it('positioning and trend findings require no special access', () => {
    expect(enrichFinding(makeInsight({ category: 'positioning' })).requiredAccess).toEqual([]);
    expect(enrichFinding(makeInsight({ category: 'trend' })).requiredAccess).toEqual([]);
  });

  it('inventory findings mention both Shopify Admin and Printify', () => {
    const access = enrichFinding(makeInsight({ category: 'inventory' })).requiredAccess;
    expect(access.some((a) => a.includes('Shopify Admin'))).toBe(true);
    expect(access.some((a) => a.includes('Printify'))).toBe(true);
  });
});

describe('buildExecutiveSummary', () => {
  it('handles zero findings', () => {
    const summary = buildExecutiveSummary([]);
    expect(summary).toContain('No findings were generated');
  });

  it('uses singular grammar for exactly one finding', () => {
    const summary = buildExecutiveSummary([makeInsight({ severity: 'low' })]);
    expect(summary).toContain('1 finding —');
    expect(summary).not.toContain('1 findings');
  });

  it('reports the severity breakdown and top categories', () => {
    const summary = buildExecutiveSummary([
      makeInsight({ severity: 'high', category: 'pricing' }),
      makeInsight({ severity: 'high', category: 'pricing' }),
      makeInsight({ severity: 'medium', category: 'seo' }),
      makeInsight({ severity: 'low', category: 'trend' }),
    ]);
    expect(summary).toContain('4 findings');
    expect(summary).toContain('2 high, 1 medium, 1 low');
    expect(summary).toContain('pricing');
    expect(summary).toContain('prioritized first');
  });

  it('notes when no high-severity findings exist', () => {
    const summary = buildExecutiveSummary([
      makeInsight({ severity: 'medium' }),
      makeInsight({ severity: 'low' }),
    ]);
    expect(summary).toContain('No high-severity findings were identified');
  });
});

describe('buildSprintRecommendation', () => {
  it('recommends a full sprint for 3+ high-severity findings', () => {
    const rec = buildSprintRecommendation([
      makeInsight({ severity: 'high' }),
      makeInsight({ severity: 'high' }),
      makeInsight({ severity: 'high' }),
    ]);
    expect(rec).toContain('fixed-price remediation sprint');
    expect(rec).toContain('3 high-severity findings');
  });

  it('recommends a scoped fix for 1-2 high-severity findings, with singular grammar for one', () => {
    const rec = buildSprintRecommendation([
      makeInsight({ severity: 'high' }),
      makeInsight({ severity: 'medium' }),
    ]);
    expect(rec).toContain('scoped fix for the 1 high-severity finding');
    expect(rec).not.toContain('findings');
    expect(rec).toContain('1 medium-severity item');
  });

  it('recommends no sprint but notes medium findings when there are no high-severity findings', () => {
    const rec = buildSprintRecommendation([
      makeInsight({ severity: 'medium' }),
      makeInsight({ severity: 'medium' }),
    ]);
    expect(rec).toContain('No sprint recommended');
    expect(rec).toContain('2 medium-severity findings');
  });

  it('recommends no sprint when everything is low severity', () => {
    const rec = buildSprintRecommendation([makeInsight({ severity: 'low' })]);
    expect(rec).toBe(
      "No sprint recommended — findings are low-priority and can be addressed at the store owner's convenience.",
    );
  });
});
