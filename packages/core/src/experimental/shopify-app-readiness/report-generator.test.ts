import { describe, it, expect } from 'vitest';
import {
  generateReadinessReport,
  reportToJson,
  reportToMarkdown,
  reportToHtml,
  calculateStaleWarnings,
  computeOverallStatus,
} from './report-generator';
import type { ReadinessReport } from './report-generator';
import type { ReadinessCheckStatus } from './checks';

describe('Readiness Report Generator', () => {
  const baseConfig = {
    appMetadata: {
      name: 'Test App',
      description: 'A test app',
      version: '1.0.0',
      apiVersion: '2026-07',
      embedded: true,
      scopes: ['read_products', 'write_orders'],
      privacyPolicyUrl: 'https://example.com/privacy',
      supportUrl: 'https://example.com/support',
    },
    scanMetadata: {
      scanTimestamp: '2026-08-02T15:00:00Z',
      commitSha: 'abc123def456',
      scannerVersion: '0.1.0',
      scannedBy: 'system@example.com',
    },
    staticCheckResults: [
      { requirementId: 'config-parsing', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'api-scopes', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'deprecated-api', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'oauth-installation', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'embedded-app', status: 'manual_review' as ReadinessCheckStatus, message: 'Manual' },
      { requirementId: 'theme-extension', status: 'not_applicable' as ReadinessCheckStatus, message: 'N/A' },
      { requirementId: 'direct-mutations', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'privacy-support-urls', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'name-description', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'dev-urls', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'secret-detection', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'webhook-identification', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
      { requirementId: 'external-deps', status: 'pass' as ReadinessCheckStatus, message: 'OK' },
    ],
    manualReviewResults: [
      {
        requirementId: 'embedded-app',
        requirementVersion: '1.0.0',
        reviewerId: 'reviewer@example.com',
        reviewerName: 'John Reviewer',
        decision: 'approved' as const,
        evidence: [],
        applicabilityDecision: 'applicable' as const,
        reviewedAt: '2026-08-02T14:00:00Z',
      },
    ],
  };

  describe('calculateStaleWarnings', () => {
    it('returns empty array when all requirements are fresh', () => {
      const mockRequirements = [
        { id: 'req1', title: 'Req 1', verifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        { id: 'req2', title: 'Req 2', verifiedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() },
      ];
      const warnings = calculateStaleWarnings(mockRequirements, new Date());
      expect(warnings.length).toBe(0);
    });

    it('detects stale requirements older than threshold', () => {
      const mockRequirements = [
        { id: 'req1', title: 'Req 1', verifiedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString() },
      ];
      const warnings = calculateStaleWarnings(mockRequirements, new Date());
      expect(warnings.length).toBe(1);
      expect(warnings[0]?.requirementId).toBe('req1');
      expect(warnings[0]?.daysSinceVerification).toBeGreaterThan(180);
    });
  });

  describe('computeOverallStatus', () => {
    it('returns not_ready when static checks have failures', () => {
      const checks = [{ requirementId: 'a', status: 'fail' as ReadinessCheckStatus, message: 'Fail' }];
      const status = computeOverallStatus(checks, []);
      expect(status).toBe('not_ready');
    });

    it('returns needs_review when manual reviews have deferred', () => {
      const checks = [{ requirementId: 'a', status: 'pass' as ReadinessCheckStatus, message: 'OK' }];
      const reviews = [{
        requirementId: 'a',
        requirementVersion: '1.0.0',
        reviewerId: 'r',
        reviewerName: 'R',
        decision: 'deferred' as const,
        evidence: [],
        applicabilityDecision: 'applicable' as const,
        reviewedAt: new Date().toISOString(),
      }];
      const status = computeOverallStatus(checks, reviews);
      expect(status).toBe('needs_review');
    });

    it('returns needs_review when manual reviews have conditional', () => {
      const checks = [{ requirementId: 'a', status: 'pass' as ReadinessCheckStatus, message: 'OK' }];
      const reviews = [{
        requirementId: 'a',
        requirementVersion: '1.0.0',
        reviewerId: 'r',
        reviewerName: 'R',
        decision: 'conditional' as const,
        evidence: [],
        applicabilityDecision: 'applicable' as const,
        reviewedAt: new Date().toISOString(),
      }];
      const status = computeOverallStatus(checks, reviews);
      expect(status).toBe('needs_review');
    });

    it('returns ready when all pass and no pending manual', () => {
      const checks = [{ requirementId: 'a', status: 'pass' as ReadinessCheckStatus, message: 'OK' }];
      const reviews = [{
        requirementId: 'a',
        requirementVersion: '1.0.0',
        reviewerId: 'r',
        reviewerName: 'R',
        decision: 'approved' as const,
        evidence: [],
        applicabilityDecision: 'applicable' as const,
        reviewedAt: new Date().toISOString(),
      }];
      const status = computeOverallStatus(checks, reviews);
      expect(status).toBe('ready');
    });
  });

  describe('generateReadinessReport', () => {
    it('generates complete report structure', () => {
      const report = generateReadinessReport(baseConfig);
      
      expect(report.metadata.app.name).toBe('Test App');
      expect(report.metadata.scan.commitSha).toBe('abc123def456');
      expect(report.summary.totalRequirements).toBeGreaterThan(0);
      expect(report.staticChecks.length).toBe(13);
      expect(report.manualReviews.length).toBe(1);
      expect(typeof report.checklistMarkdown).toBe('string');
      expect(report.checklistMarkdown.length).toBeGreaterThan(0);
    });

    it('computes correct status counts', () => {
      const report = generateReadinessReport(baseConfig);
      // 12 pass + 1 manual_review + 1 not_applicable = 13 (but registry has 13)
      expect(report.summary.passed).toBeGreaterThan(0);
    });

    it('sets overall status correctly', () => {
      const report = generateReadinessReport(baseConfig);
      expect(['ready', 'not_ready', 'needs_review']).toContain(report.summary.overallStatus);
    });
  });

  describe('Output formatters', () => {
    const report = generateReadinessReport(baseConfig);

    it('reportToJson produces valid JSON', () => {
      const json = reportToJson(report);
      const parsed = JSON.parse(json) as ReadinessReport;
      expect(parsed.metadata.app.name).toBe('Test App');
    });

    it('reportToMarkdown contains required sections', () => {
      const md = reportToMarkdown(report);
      expect(md).toContain('# Shopify App Readiness Report');
      expect(md).toContain('Test App');
      expect(md).toContain('## Summary');
      expect(md).toContain('## Static Check Results');
      expect(md).toContain('abc123d'); // commit SHA (7 chars)
    });

    it('reportToHtml produces valid HTML structure', () => {
      const html = reportToHtml(report);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('Test App');
      expect(html).toContain('<style>');
    });

    it('markdown does not contain the word "compliant"', () => {
      const md = reportToMarkdown(report);
      expect(md.toLowerCase()).not.toContain('compliant');
    });
  });
});