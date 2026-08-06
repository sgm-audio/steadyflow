import { describe, it, expect } from 'vitest';
import { generateReport } from './index.js';
import type { RequirementItem, CheckResult, ManualReview, AppMetadata } from './types.js';

const sampleRegistry: RequirementItem[] = [
  {
    id: 'req-001',
    name: 'Shopify Storefront API Access',
    description: 'Required access to Shopify Storefront API',
    status: 'required',
    version: '2024.0',
    verified_at: '2024-01-01T00:00:00Z',
    details_url: 'https://shopify.dev/docs/api/storefront',
  },
  {
    id: 'req-002',
    name: 'Product Listing API',
    description: 'Required access to Product Listing API',
    status: 'required',
    version: '2024.0',
    verified_at: '2024-01-01T00:00:00Z',
    details_url: 'https://shopify.dev/docs/api/product-listing',
  },
  {
    id: 'req-003',
    name: 'Deprecated Feature',
    description: 'A deprecated requirement',
    status: 'deprecated',
    version: '2023.0',
    verified_at: '2023-06-01T00:00:00Z',
    details_url: 'https://shopify.dev/docs/deprecated',
  },
  {
    id: 'req-004',
    name: 'Not Applicable Feature',
    description: 'A not-applicable requirement',
    status: 'not_applicable',
    version: '2024.0',
    verified_at: '2024-01-01T00:00:00Z',
    details_url: 'https://shopify.dev/docs/na',
  },
];

const sampleCheckResults: CheckResult[] = [
  {
    id: 'check-001',
    name: 'API Connectivity Test',
    status: 'pass',
    message: 'API connectivity test passed',
    source_url: 'https://example.com/test-results/api-connectivity',
  },
  {
    id: 'check-002',
    name: 'Product Data Validation',
    status: 'warning',
    message: 'Some product data validation warnings detected',
    source_url: 'https://example.com/test-results/product-validation',
  },
];

const sampleManualReviews: ManualReview[] = [
  {
    id: 'review-001',
    reviewer: 'jane.doe@example.com',
    status: 'completed',
    comments: 'Manual review completed successfully',
    timestamp: '2024-01-01T00:00:00Z',
    evidence_url: 'https://example.com/reviews/001.pdf',
  },
  {
    id: 'review-002',
    reviewer: 'john.smith@example.com',
    status: 'pending',
    comments: 'Awaiting review',
    timestamp: '2024-01-02T00:00:00Z',
    evidence_url: 'https://example.com/reviews/002.pdf',
  },
];

const sampleAppMetadata: AppMetadata = {
  name: 'Test Shopify App',
  description: 'A test application for Shopify integration',
  developer: 'Test Developer',
  repository_url: 'https://github.com/testorg/test-shopify-app',
  commit_sha: 'abc123def456',
  target_platform: 'shopify',
  sdk_version: '1.0.0',
  api_version: '2024-01',
};

const sampleScanTimestamp = '2024-01-01T00:00:00Z';

describe('generateReport', () => {
  it('generates a report with all required sections', () => {
    const report = generateReport(
      sampleRegistry,
      sampleCheckResults,
      sampleManualReviews,
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    expect(report.executive_summary).toContain('Test Shopify App');
    expect(report.experimental_disclaimer).toBeDefined();
    expect(report.target_repository.repository_url).toBe('https://github.com/testorg/test-shopify-app');
    expect(report.target_repository.commit_sha).toBe('abc123def456');
    expect(report.target_repository.scan_timestamp).toBe(sampleScanTimestamp);
    expect(report.registry.version).toBe('2024.0');
    expect(report.registry.entries).toHaveLength(4);
    expect(report.readiness.overall_status).toBe('ready_for_submission_review');
    expect(report.readiness.blocker_count).toBeGreaterThanOrEqual(0);
    expect(report.readiness.warning_count).toBeGreaterThanOrEqual(0);
    expect(report.readiness.manual_review_count).toBe(2);
    expect(report.findings.all_items.length).toBeGreaterThan(0);
    expect(report.recommended_remediation).toBeDefined();
    expect(report.official_shopify_sources.length).toBeGreaterThan(0);
    expect(report.limitations.length).toBeGreaterThan(0);
    expect(report.submission_preparation_checklist.length).toBeGreaterThan(0);
  });

  it('includes all requirement items in findings', () => {
    const report = generateReport(
      sampleRegistry,
      [],
      [],
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    const requirementFindings = report.findings.all_items.filter(
      (f) => f.type === 'requirement',
    );
    expect(requirementFindings).toHaveLength(4);
  });

  it('includes all check results in findings', () => {
    const report = generateReport(
      [],
      sampleCheckResults,
      [],
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    const checkFindings = report.findings.all_items.filter(
      (f) => f.type === 'check',
    );
    expect(checkFindings).toHaveLength(2);
  });

  it('includes all manual reviews in findings', () => {
    const report = generateReport(
      [],
      [],
      sampleManualReviews,
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    const reviewFindings = report.findings.all_items.filter(
      (f) => f.type === 'manual_review',
    );
    expect(reviewFindings).toHaveLength(2);
  });

  it('groups findings by category', () => {
    const report = generateReport(
      sampleRegistry,
      sampleCheckResults,
      sampleManualReviews,
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    const categories = Object.keys(report.findings.by_category);
    expect(categories.length).toBeGreaterThan(0);

    for (const category of categories) {
      const entry = report.findings.by_category[category];
      expect(entry).toBeDefined();
      expect(entry.count).toBeGreaterThan(0);
      expect(entry.items.length).toBe(entry.count);
    }
  });

  it('populates evidence map from findings with URLs', () => {
    const report = generateReport(
      sampleRegistry,
      sampleCheckResults,
      sampleManualReviews,
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    expect(Object.keys(report.evidence).length).toBeGreaterThan(0);
  });

  it('flags stale requirements', () => {
    const report = generateReport(
      sampleRegistry,
      [],
      [],
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    // req-003 is deprecated — should appear in stale warnings
    const hasDeprecated = report.stale_requirement_warnings.some((w) =>
      w.includes('Deprecated Feature'),
    );
    expect(hasDeprecated).toBe(true);
  });

  it('handles empty inputs gracefully', () => {
    const report = generateReport(
      [],
      [],
      [],
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    expect(report.executive_summary).toContain('Test Shopify App');
    expect(report.findings.all_items).toHaveLength(0);
    expect(report.readiness.blocker_count).toBe(0);
    expect(report.readiness.warning_count).toBe(0);
    expect(report.readiness.manual_review_count).toBe(0);
  });

  it('handles not_applicable requirements as info status', () => {
    const notApplicableReq = sampleRegistry[3];
    expect(notApplicableReq).toBeDefined();
    const report = generateReport(
      [notApplicableReq],
      [],
      [],
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    const finding = report.findings.all_items[0];
    expect(finding).toBeDefined();
    expect(finding.status).toBe('info');
  });

  it('handles deprecated requirements', () => {
    const deprecatedReq = sampleRegistry[2];
    expect(deprecatedReq).toBeDefined();
    const report = generateReport(
      [deprecatedReq],
      [],
      [],
      sampleAppMetadata,
      sampleScanTimestamp,
    );

    expect(report.stale_requirement_warnings.length).toBeGreaterThan(0);
  });
});