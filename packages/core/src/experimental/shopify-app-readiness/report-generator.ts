import { hashObject } from '../../audit/hash.js';
import { redactSecrets } from '../../audit/redact.js';
import type { ReadinessCheckResult } from './checks';
import type { ManualReviewChecklistItem, ManualReviewItem } from './manual-review';
import { generateChecklistItems, generateMarkdownChecklist } from './manual-review';
import { getShopifyAppRequirements } from './registry';
import type { ShopifyAppRequirement } from './schema';

export interface AppMetadata {
  name: string;
  description: string;
  version: string;
  apiVersion: string;
  embedded: boolean;
  scopes: string[];
  privacyPolicyUrl?: string | undefined;
  supportUrl?: string | undefined;
  webhooks?: { topic: string; address: string }[] | undefined;
  extensions?: { type: string; handle: string }[] | undefined;
  oauth?: { redirectUris?: string[] | undefined } | undefined;
  developmentUrls?: string[] | undefined;
  mutations?: string[] | undefined;
  externalDependencies?: string[] | undefined;
}

export interface ScanMetadata {
  scanTimestamp: string;
  commitSha: string;
  scannerVersion: string;
  scannedBy: string;
}

export interface StaleRequirementWarning {
  requirementId: string;
  requirementTitle: string;
  verifiedAt: string;
  daysSinceVerification: number;
  thresholdDays: number;
}

export interface ReadinessReport {
  metadata: {
    app: AppMetadata;
    scan: ScanMetadata;
    registryVersion: string;
    generatedAt: string;
  };
  summary: {
    totalRequirements: number;
    passed: number;
    failed: number;
    warnings: number;
    manualReview: number;
    notApplicable: number;
    unknown: number;
    overallStatus: 'ready' | 'not_ready' | 'needs_review';
  };
  staticChecks: ReadinessCheckResult[];
  manualReviews: ManualReviewItem[];
  staleWarnings: StaleRequirementWarning[];
  checklistMarkdown: string;
  /** SHA-256 of the canonical report content (excluding reportHash and checklistMarkdown). Detects post-generation tampering. */
  reportHash: string;
}

const STALE_THRESHOLD_DAYS = 180; // 6 months

/**
 * Compute the integrity hash for a report. Covers the substantive report data
 * (metadata, summary, checks, reviews, stale warnings) but excludes the derived
 * `checklistMarkdown` and the `reportHash` field itself so it can be recomputed
 * and compared by a verifier.
 */
export function computeReportHash(report: ReadinessReport): string {
  const { reportHash: _reportHash, checklistMarkdown: _checklist, ...core } = report;
  return hashObject(core);
}

export function calculateStaleWarnings(
  requirements: Pick<ShopifyAppRequirement, 'id' | 'title' | 'verifiedAt'>[],
  scannedAt: Date,
): StaleRequirementWarning[] {
  const warnings: StaleRequirementWarning[] = [];
  for (const req of requirements) {
    const verified = new Date(req.verifiedAt);
    const daysSince = Math.floor(
      (scannedAt.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSince > STALE_THRESHOLD_DAYS) {
      warnings.push({
        requirementId: req.id,
        requirementTitle: req.title,
        verifiedAt: req.verifiedAt,
        daysSinceVerification: daysSince,
        thresholdDays: STALE_THRESHOLD_DAYS,
      });
    }
  }
  return warnings;
}

export function computeOverallStatus(
  staticChecks: ReadinessCheckResult[],
  manualReviews: ManualReviewItem[],
): 'ready' | 'not_ready' | 'needs_review' {
  const hasFailures = staticChecks.some((c) => c.status === 'fail');
  const hasUnknown = staticChecks.some((c) => c.status === 'unknown');

  // A `manual_review` check that lacks any matching review is unresolved.
  const manualReviewIds = staticChecks
    .filter((c) => c.status === 'manual_review')
    .map((c) => c.requirementId);
  const hasUnresolvedManual = manualReviewIds.some(
    (id) => !manualReviews.some((r) => r.requirementId === id),
  );

  const hasPendingManual = manualReviews.some((r) => r.decision === 'deferred');
  const hasConditional = manualReviews.some((r) => r.decision === 'conditional');

  if (hasFailures) return 'not_ready';
  if (hasUnknown || hasUnresolvedManual || hasPendingManual || hasConditional)
    return 'needs_review';
  return 'ready';
}

export function generateReadinessReport(config: {
  appMetadata: AppMetadata;
  scanMetadata: ScanMetadata;
  staticCheckResults: ReadinessCheckResult[];
  manualReviewResults: ManualReviewItem[];
}): ReadinessReport {
  const requirements = getShopifyAppRequirements();
  const scannedAt = new Date(config.scanMetadata.scanTimestamp);

  const staleWarnings = calculateStaleWarnings(requirements, scannedAt);

  const checklistItems = generateChecklistItems(
    requirements.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      severity: r.severity,
      validationMode: r.validationMode,
      officialSourceUrl: r.officialSourceUrl,
      officialSourceTitle: r.officialSourceTitle,
    })),
  );

  // Merge manual review status into checklist items
  const checklistWithReviews: ManualReviewChecklistItem[] = checklistItems.map((item) => {
    const review = config.manualReviewResults.find((r) => r.requirementId === item.requirementId);
    if (review) {
      return {
        ...item,
        status: 'completed' as const,
        reviewItem: review,
      };
    }
    return item;
  });

  const checklistMarkdown = generateMarkdownChecklist(checklistWithReviews, {
    appName: config.appMetadata.name,
    appId: config.appMetadata.version, // using version as appId placeholder
    generatedAt: new Date().toISOString(),
    generatedBy: config.scanMetadata.scannedBy,
    totalItems: checklistItems.length,
    completedItems: checklistWithReviews.filter((i) => i.status === 'completed').length,
  });

  const staticChecks = config.staticCheckResults;
  const manualReviews = config.manualReviewResults;

  const statusCounts = {
    passed: staticChecks.filter((c) => c.status === 'pass').length,
    failed: staticChecks.filter((c) => c.status === 'fail').length,
    warnings: staticChecks.filter((c) => c.status === 'warning').length,
    manualReview: staticChecks.filter((c) => c.status === 'manual_review').length,
    notApplicable: staticChecks.filter((c) => c.status === 'not_applicable').length,
    unknown: staticChecks.filter((c) => c.status === 'unknown').length,
  };

  let overallStatus = computeOverallStatus(staticChecks, manualReviews);
  // Stale requirement data cannot yield a confident "ready" verdict.
  if (staleWarnings.length > 0 && overallStatus === 'ready') {
    overallStatus = 'needs_review';
  }

  const report: ReadinessReport = {
    metadata: {
      app: config.appMetadata,
      scan: config.scanMetadata,
      registryVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
    },
    summary: {
      totalRequirements: requirements.length,
      ...statusCounts,
      overallStatus,
    },
    staticChecks,
    manualReviews,
    staleWarnings,
    checklistMarkdown,
    reportHash: '',
  };

  report.reportHash = computeReportHash(report);

  return report;
}

export function reportToJson(report: ReadinessReport): string {
  // Defense-in-depth: never let secret-shaped values escape into the report.
  return JSON.stringify(redactSecrets(report), null, 2);
}

export function reportToMarkdown(report: ReadinessReport): string {
  const lines: string[] = [];

  lines.push(`# Shopify App Readiness Report`);
  lines.push('');
  lines.push(`**App:** ${report.metadata.app.name} v${report.metadata.app.version}`);
  lines.push(
    `**Scan:** ${report.metadata.scan.scanTimestamp} (${report.metadata.scan.commitSha.slice(0, 7)})`,
  );
  lines.push(`**Registry:** v${report.metadata.registryVersion}`);
  lines.push(`**Generated:** ${report.metadata.generatedAt}`);
  lines.push('');

  lines.push(`## Summary`);
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Requirements | ${report.summary.totalRequirements} |`);
  lines.push(`| ✅ Passed | ${report.summary.passed} |`);
  lines.push(`| ❌ Failed | ${report.summary.failed} |`);
  lines.push(`| ⚠️ Warnings | ${report.summary.warnings} |`);
  lines.push(`| 🔍 Manual Review | ${report.summary.manualReview} |`);
  lines.push(`| ➖ Not Applicable | ${report.summary.notApplicable} |`);
  lines.push(`| ❓ Unknown | ${report.summary.unknown} |`);
  lines.push(`| **Overall** | **${report.summary.overallStatus.toUpperCase()}** |`);
  lines.push('');

  if (report.staleWarnings.length > 0) {
    lines.push(`## ⚠️ Stale Requirements (verified >${STALE_THRESHOLD_DAYS} days ago)`);
    lines.push('');
    for (const w of report.staleWarnings) {
      lines.push(
        `- **${w.requirementTitle}** (${w.requirementId}): verified ${w.daysSinceVerification} days ago`,
      );
    }
    lines.push('');
  }

  lines.push(`## Static Check Results`);
  lines.push('');
  for (const check of report.staticChecks) {
    const icon =
      check.status === 'pass'
        ? '✅'
        : check.status === 'fail'
          ? '❌'
          : check.status === 'warning'
            ? '⚠️'
            : check.status === 'manual_review'
              ? '🔍'
              : check.status === 'not_applicable'
                ? '➖'
                : '❓';
    lines.push(`### ${icon} ${check.requirementId} — ${check.status.toUpperCase()}`);
    lines.push(`> ${check.message}`);
    if (check.evidence) {
      lines.push(`\`\`\`json`);
      lines.push(JSON.stringify(redactSecrets(check.evidence), null, 2));
      lines.push(`\`\`\``);
    }
    lines.push('');
  }

  if (report.manualReviews.length > 0) {
    lines.push(`## Manual Review Results`);
    lines.push('');
    for (const review of report.manualReviews) {
      const decisionIcon =
        review.decision === 'approved'
          ? '✅'
          : review.decision === 'rejected'
            ? '❌'
            : review.decision === 'conditional'
              ? '⚠️'
              : '⏳';
      lines.push(`### ${decisionIcon} ${review.requirementId} — ${review.decision.toUpperCase()}`);
      lines.push(`- **Reviewer:** ${review.reviewerName} (${review.reviewerId})`);
      lines.push(`- **Reviewed:** ${review.reviewedAt}`);
      lines.push(`- **Applicability:** ${review.applicabilityDecision}`);
      if (review.applicabilityReason) lines.push(`- **Reason:** ${review.applicabilityReason}`);
      if (review.waiver)
        lines.push(`- **Waiver:** ${review.waiver.id} (granted by ${review.waiver.grantedBy})`);
      if (review.evidence.length) {
        lines.push(
          `- **Evidence:** ${review.evidence.map((e) => `${e.type}: ${e.description}`).join(', ')}`,
        );
      }
      if (review.notes) lines.push(`- **Notes:** ${review.notes}`);
      lines.push('');
    }
  }

  lines.push(`---`);
  lines.push(
    `*Report generated by SteadyFlow Shopify App Readiness Module — not a compliance guarantee*`,
  );

  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function reportToHtml(report: ReadinessReport): string {
  const markdown = reportToMarkdown(report);
  // Escape all HTML-special characters BEFORE converting markdown so that
  // user-controlled content (app name, description, evidence, notes) cannot
  // inject markup or scripts into the rendered HTML. The markdown syntax
  // characters (#, *, `, |, -) are unaffected by this escaping.
  let html = escapeHtml(markdown)
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

  // Handle tables (basic)
  html = html.replace(/\|([^|]+)\|([^|]+)\|/g, '<tr><td>$1</td><td>$2</td></tr>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Shopify App Readiness Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
    h1, h2, h3 { color: #1a1a1a; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 4px; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 8px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f5f5f5; }
    .stale { background: #fff3cd; padding: 1rem; border-radius: 4px; margin: 1rem 0; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}
