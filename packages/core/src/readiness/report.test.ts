import { describe, expect, it } from 'vitest';
import { buildReadinessReport } from './report.js';
import { BuildReadinessReportInput, ReadinessReport } from './schemas.js';

const generatedAt = '2026-08-02T12:00:00.000Z';
const source = { url: 'https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements', lastVerifiedOn: '2026-08-02' };
const automatic = { id: 'automatic', title: 'Automatic check', description: 'A deterministic check.', verificationMode: 'automatic' as const, source };
const manual = { id: 'manual', title: 'Manual check', description: 'A reviewer check.', verificationMode: 'manual' as const, source };

describe('buildReadinessReport', () => {
  it('builds a deterministic summary and preserves evidence', () => {
    const report = buildReadinessReport({
      requirements: [automatic, { ...automatic, id: 'warning' }, manual],
      assessments: [
        { requirementId: 'automatic', status: 'pass', evidence: [{ kind: 'test', locator: 'core.test', summary: 'Passed.' }] },
        { requirementId: 'warning', status: 'warning', evidence: [] },
        { requirementId: 'manual', status: 'manual_review', evidence: [], notes: 'Review needed.' },
      ], generatedAt,
    });
    expect(report.summary).toEqual({ pass: 1, fail: 0, warning: 1, manualReview: 1, notApplicable: 0, unknown: 0, automatedScore: 50 });
    expect(report.findings[0]?.evidence[0]?.locator).toBe('core.test');
    expect(report.findings[2]?.notes).toBe('Review needed.');
    expect(ReadinessReport.parse(report)).toEqual(report);
  });

  it('fails closed on malformed boundaries and unofficial sources', () => {
    expect(() => BuildReadinessReportInput.parse({ requirements: [{ ...automatic, extra: true }], assessments: [], generatedAt })).toThrow();
    expect(() => BuildReadinessReportInput.parse({ requirements: [{ ...automatic, source: { ...source, url: 'https://example.com/rules' } }], assessments: [], generatedAt })).toThrow();
  });

  it('defaults absent evidence conservatively', () => {
    const report = buildReadinessReport({ requirements: [automatic, manual], assessments: [], generatedAt });
    expect(report.findings.map(({ status }) => status)).toEqual(['unknown', 'manual_review']);
    expect(report.summary.automatedScore).toBeNull();
  });

  it('rejects duplicate and unknown identifiers', () => {
    expect(() => buildReadinessReport({ requirements: [automatic, automatic], assessments: [], generatedAt })).toThrow('Duplicate requirement id');
    expect(() => buildReadinessReport({ requirements: [automatic], assessments: [
      { requirementId: 'automatic', status: 'pass', evidence: [] },
      { requirementId: 'automatic', status: 'fail', evidence: [] },
    ], generatedAt })).toThrow('Duplicate assessment requirement id');
    expect(() => buildReadinessReport({ requirements: [automatic], assessments: [{ requirementId: 'missing', status: 'unknown', evidence: [] }], generatedAt })).toThrow('Assessment references unknown requirement missing');
  });

  it('keeps manual and automatic decisions separate', () => {
    expect(() => buildReadinessReport({ requirements: [manual], assessments: [{ requirementId: 'manual', status: 'pass', evidence: [] }], generatedAt })).toThrow('Manual requirement manual cannot be resolved as pass');
    expect(() => buildReadinessReport({ requirements: [automatic], assessments: [{ requirementId: 'automatic', status: 'manual_review', evidence: [] }], generatedAt })).toThrow('Automatic requirement automatic cannot be resolved as manual_review');
  });

  it('counts fail, not applicable, and unknown outcomes', () => {
    const report = buildReadinessReport({
      requirements: [automatic, { ...automatic, id: 'na' }, { ...automatic, id: 'unknown' }],
      assessments: [
        { requirementId: 'automatic', status: 'fail', evidence: [] },
        { requirementId: 'na', status: 'not_applicable', evidence: [] },
        { requirementId: 'unknown', status: 'unknown', evidence: [] },
      ], generatedAt,
    });
    expect(report.summary).toMatchObject({ fail: 1, notApplicable: 1, unknown: 1, automatedScore: 0 });
  });
});
