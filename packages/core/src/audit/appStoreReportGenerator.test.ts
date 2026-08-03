import { describe, it, expect } from 'vitest';
import {
  generateAppStoreReport,
  formatAppStoreReportAsJson,
  formatAppStoreReportAsMarkdown,
} from './appStoreReportGenerator.js';
import type { AppStoreRegistry, AppStoreScanResult } from './appStoreReport.js';

const now = new Date().toISOString();
const commitSha = 'a'.repeat(40);

const baseRegistry: AppStoreRegistry = {
  version: '1.0.0',
  createdAt: now,
  lastVerified: now,
  requirements: [
    {
      id: 'privacy_policy',
      title: 'Privacy Policy URL',
      description: 'App must include a privacy policy URL.',
      category: 'privacy_security',
      severity: 'blocker',
      officialLink: 'https://shopify.dev/docs/apps/privacy',
      lastVerifiedAt: now,
      automated: true,
    },
    {
      id: 'support_email',
      title: 'Support Email',
      description: 'App must provide a support email.',
      category: 'app_metadata',
      severity: 'blocker',
      officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
      lastVerifiedAt: now,
      automated: false,
    },
    {
      id: 'performance_lcp',
      title: 'Core Web Vitals: LCP < 2.5s',
      description: 'App pages must meet Core Web Vitals.',
      category: 'performance',
      severity: 'warning',
      officialLink: 'https://shopify.dev/docs/apps/build/performance',
      lastVerifiedAt: now,
      automated: true,
    },
  ],
};

describe('appStoreReportGenerator (experimental)', () => {
  it('generates a ready_for_submission_review report when all blockers pass', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'support_email',
            title: 'Support Email',
            description: 'App must provide a support email.',
            officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'performance_lcp',
            title: 'Core Web Vitals: LCP < 2.5s',
            description: 'App pages must meet Core Web Vitals.',
            officialLink: 'https://shopify.dev/docs/apps/build/performance',
            lastVerified: now,
          },
          status: 'pass',
        },
      ],
      manualReviewResults: [
        {
          requirementId: 'support_email',
          status: 'pass',
          reviewedAt: now,
        },
      ],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    expect(report.overallStatus).toBe('ready_for_submission_review');
    expect(report.counts.blockers).toBe(0);
    expect(report.counts.pass).toBe(3);
  });

  it('marks as not_ready when blockers fail', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'fail',
        },
        {
          requirement: {
            id: 'support_email',
            title: 'Support Email',
            description: 'App must provide a support email.',
            officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'performance_lcp',
            title: 'Core Web Vitals: LCP < 2.5s',
            description: 'App pages must meet Core Web Vitals.',
            officialLink: 'https://shopify.dev/docs/apps/build/performance',
            lastVerified: now,
          },
          status: 'pass',
        },
      ],
      manualReviewResults: [
        {
          requirementId: 'support_email',
          status: 'pass',
          reviewedAt: now,
        },
      ],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    expect(report.overallStatus).toBe('not_ready');
    expect(report.counts.blockers).toBe(1);
  });

  it('marks as needs_review when non-blocker manual reviews are incomplete', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'support_email',
            title: 'Support Email',
            description: 'App must provide a support email.',
            officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'performance_lcp',
            title: 'Core Web Vitals: LCP < 2.5s',
            description: 'App pages must meet Core Web Vitals.',
            officialLink: 'https://shopify.dev/docs/apps/build/performance',
            lastVerified: now,
          },
          status: 'manual_review',
        },
      ],
      manualReviewResults: [
        {
          requirementId: 'support_email',
          status: 'pass',
          reviewedAt: now,
        },
      ],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    expect(report.overallStatus).toBe('needs_review');
    expect(report.counts.manualReviewRequired).toBeGreaterThan(0);
  });

  it('marks as not_ready when unknown blockers exist', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'unknown',
        },
        {
          requirement: {
            id: 'support_email',
            title: 'Support Email',
            description: 'App must provide a support email.',
            officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'performance_lcp',
            title: 'Core Web Vitals: LCP < 2.5s',
            description: 'App pages must meet Core Web Vitals.',
            officialLink: 'https://shopify.dev/docs/apps/build/performance',
            lastVerified: now,
          },
          status: 'pass',
        },
      ],
      manualReviewResults: [
        {
          requirementId: 'support_email',
          status: 'pass',
          reviewedAt: now,
        },
      ],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    expect(report.overallStatus).toBe('not_ready');
    expect(report.counts.unknown).toBeGreaterThan(0);
  });

  it('marks as conditionally_ready when only warnings exist', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'support_email',
            title: 'Support Email',
            description: 'App must provide a support email.',
            officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'performance_lcp',
            title: 'Core Web Vitals: LCP < 2.5s',
            description: 'App pages must meet Core Web Vitals.',
            officialLink: 'https://shopify.dev/docs/apps/build/performance',
            lastVerified: now,
          },
          status: 'fail',
        },
      ],
      manualReviewResults: [
        {
          requirementId: 'support_email',
          status: 'pass',
          reviewedAt: now,
        },
      ],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    expect(report.overallStatus).toBe('conditionally_ready');
    expect(report.counts.warnings).toBe(1);
  });

  it('includes stale blockers when requirements are older than 90 days', () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 91);
    const staleDateIso = staleDate.toISOString();

    const staleRegistry: AppStoreRegistry = {
      ...baseRegistry,
      requirements: [
        {
          id: 'privacy_policy',
          title: 'Privacy Policy URL',
          description: 'App must include a privacy policy URL.',
          category: 'privacy_security',
          severity: 'blocker',
          officialLink: 'https://shopify.dev/docs/apps/privacy',
          lastVerifiedAt: staleDateIso,
          automated: true,
        },
        {
          id: 'support_email',
          title: 'Support Email',
          description: 'App must provide a support email.',
          category: 'app_metadata',
          severity: 'blocker',
          officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
          lastVerifiedAt: now,
          automated: false,
        },
        {
          id: 'performance_lcp',
          title: 'Core Web Vitals: LCP < 2.5s',
          description: 'App pages must meet Core Web Vitals.',
          category: 'performance',
          severity: 'warning',
          officialLink: 'https://shopify.dev/docs/apps/build/performance',
          lastVerifiedAt: now,
          automated: true,
        },
      ],
    };

    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'support_email',
            title: 'Support Email',
            description: 'App must provide a support email.',
            officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'performance_lcp',
            title: 'Core Web Vitals: LCP < 2.5s',
            description: 'App pages must meet Core Web Vitals.',
            officialLink: 'https://shopify.dev/docs/apps/build/performance',
            lastVerified: now,
          },
          status: 'pass',
        },
      ],
      manualReviewResults: [
        {
          requirementId: 'support_email',
          status: 'pass',
          reviewedAt: now,
        },
      ],
    };

    const report = generateAppStoreReport(staleRegistry, scan);
    expect(report.staleDependencies).toContain('privacy_policy');
  });

  it('formats report as valid JSON', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'support_email',
            title: 'Support Email',
            description: 'App must provide a support email.',
            officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'performance_lcp',
            title: 'Core Web Vitals: LCP < 2.5s',
            description: 'App pages must meet Core Web Vitals.',
            officialLink: 'https://shopify.dev/docs/apps/build/performance',
            lastVerified: now,
          },
          status: 'pass',
        },
      ],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    const json = formatAppStoreReportAsJson(report);
    expect(json).toContain('ready_for_submission_review');
    const parsed: unknown = JSON.parse(json);
    expect((parsed as Record<string, unknown>).overallStatus).toBe('ready_for_submission_review');
  });

  it('formats report as Markdown with proper structure', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'pass',
        },
      ],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    const md = formatAppStoreReportAsMarkdown(report);
    expect(md).toContain('# Shopify App Store Readiness Report');
    expect(md).toContain('⚠️ Experimental Disclaimer');
    expect(md).toContain('## Submission Checklist');
    expect(md).toContain('## Limitations');
    expect(md).toContain('✅');
  });

  it('avoids misleading language like "compliant"', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [
        {
          requirement: {
            id: 'privacy_policy',
            title: 'Privacy Policy URL',
            description: 'App must include a privacy policy URL.',
            officialLink: 'https://shopify.dev/docs/apps/privacy',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'support_email',
            title: 'Support Email',
            description: 'App must provide a support email.',
            officialLink: 'https://shopify.dev/docs/apps/partner-essentials',
            lastVerified: now,
          },
          status: 'pass',
        },
        {
          requirement: {
            id: 'performance_lcp',
            title: 'Core Web Vitals: LCP < 2.5s',
            description: 'App pages must meet Core Web Vitals.',
            officialLink: 'https://shopify.dev/docs/apps/build/performance',
            lastVerified: now,
          },
          status: 'pass',
        },
      ],
      manualReviewResults: [
        {
          requirementId: 'support_email',
          status: 'pass',
          reviewedAt: now,
        },
      ],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    const md = formatAppStoreReportAsMarkdown(report);
    expect(md).not.toContain('compliant');
    expect(md).not.toContain('approved');
  });

  it('handles empty findings list', () => {
    const scan: AppStoreScanResult = {
      registryVersion: '1.0.0',
      scanTimestamp: now,
      repositoryCommitSha: commitSha,
      findings: [],
    };

    const report = generateAppStoreReport(baseRegistry, scan);
    expect(report.counts.pass).toBe(0);
    expect(report.executiveSummary).toContain('analyzed 0 requirements');
  });
});
