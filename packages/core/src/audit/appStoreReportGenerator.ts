import type { AppStoreRegistry, AppStoreScanResult, AppStoreReport, AppStoreReadinessStatus } from './appStoreReport.js';
import type { AppStoreRequirementResult } from './appStoreReadiness.js';

/**
 * Report generator that synthesizes a registry, scan results, and manual reviews
 * into a structured App Store Readiness Report with decision logic.
 *
 * Decision rules:
 * - Any blocker that is unresolved prevents "ready_for_submission_review"
 * - Any stale blocker-level requirement prevents a ready status
 * - Unknown applicability for blocker requirements prevents a ready status
 * - Manual-review requirements must be explicitly pass/not_applicable (not just unknown)
 * - Avoid "compliant" language; use neutral evidence-based descriptions
 */

export const generateAppStoreReport = (
  registry: AppStoreRegistry,
  scan: AppStoreScanResult,
): AppStoreReport => {
  const now = new Date().toISOString();

  // ──────────────────────────────────────────────────────────────────────────
  // Count and categorize findings
  // ──────────────────────────────────────────────────────────────────────────

  type CountKey = 'blockers' | 'warnings' | 'manualReviewRequired' | 'unknown' | 'pass';
  const counts: Record<CountKey, number> = {
    blockers: 0,
    warnings: 0,
    manualReviewRequired: 0,
    unknown: 0,
    pass: 0,
  };

  const findingsByCategory: Record<string, AppStoreRequirementResult[]> = {};
  const unresolved: { req: AppStoreRequirementResult; severity: string }[] = [];
  const staleBlockers: { requirementId: string; lastVerifiedAt: string }[] = [];

  for (const finding of scan.findings) {
    const req = registry.requirements.find((r) => r.id === finding.requirement.id);
    const severity = req?.severity ?? 'info';
    const category = (req?.category ?? 'other') as string;

    findingsByCategory[category] ??= [];
    findingsByCategory[category].push(finding);

    if (finding.status === 'pass') {
      counts.pass += 1;
    } else if (finding.status === 'fail') {
      if (severity === 'blocker') {
        counts.blockers += 1;
      } else {
        counts.warnings += 1;
      }
      unresolved.push({ req: finding, severity });
    } else if (finding.status === 'manual_review') {
      counts.manualReviewRequired += 1;
      if (severity === 'blocker') {
        unresolved.push({ req: finding, severity: 'blocker (manual)' });
      }
    } else if (finding.status === 'unknown') {
      counts.unknown += 1;
      if (severity === 'blocker') {
        unresolved.push({ req: finding, severity: 'blocker (unknown applicability)' });
      }
    }

    // Check staleness (requirements older than 90 days)
    if (req) {
      const verified = new Date(req.lastVerifiedAt);
      const now_date = new Date(scan.scanTimestamp);
      const days_old = (now_date.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24);
      if (days_old > 90 && severity === 'blocker') {
        staleBlockers.push({ requirementId: req.id, lastVerifiedAt: req.lastVerifiedAt });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Check manual reviews (must be complete for blocker requirements)
  // ──────────────────────────────────────────────────────────────────────────

  const manualReviews = scan.manualReviewResults ?? [];
  for (const req of registry.requirements) {
    if (req.severity === 'blocker' && !req.automated) {
      const hasFinding = scan.findings.some((f) => f.requirement.id === req.id);
      const review = manualReviews.find((r) => r.requirementId === req.id);

      if (!hasFinding) {
        if (!review || review.status === 'fail') {
          counts.manualReviewRequired += 1;
          unresolved.push({
            req: {
              requirement: {
                id: req.id,
                title: req.title,
                description: req.description,
                officialLink: req.officialLink,
                lastVerified: req.lastVerifiedAt,
              },
              status: 'manual_review',
            },
            severity: 'blocker (manual)',
          });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Determine overall readiness status
  // ──────────────────────────────────────────────────────────────────────────

  let status: AppStoreReadinessStatus = 'ready_for_submission_review';

  if (counts.blockers > 0 || staleBlockers.length > 0) {
    status = 'not_ready';
  } else if (
    unresolved.filter((u) => u.severity.includes('blocker')).length > 0 ||
    staleBlockers.length > 0
  ) {
    status = 'not_ready';
  } else if (counts.manualReviewRequired > 0 || counts.unknown > 0) {
    status = 'needs_review';
  } else if (counts.warnings > 0) {
    status = 'conditionally_ready';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Build submission checklist
  // ──────────────────────────────────────────────────────────────────────────

  const checklist = registry.requirements.map((req) => {
    const finding = scan.findings.find((f) => f.requirement.id === req.id);
    const review = manualReviews.find((r) => r.requirementId === req.id);

    let checklistStatus: 'pass' | 'fail' | 'manual_review' | 'not_applicable' = 'fail';
    if (finding?.status === 'pass') checklistStatus = 'pass';
    else if (finding?.status === 'manual_review') checklistStatus = 'manual_review';
    else if (review?.status === 'pass') checklistStatus = 'pass';
    else if (review?.status === 'not_applicable') checklistStatus = 'not_applicable';

    return {
      item: `${req.title} [${req.id}]`,
      status: checklistStatus,
      requiredForSubmission: req.severity === 'blocker',
    };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Build recommendations
  // ──────────────────────────────────────────────────────────────────────────

  const recommendations = unresolved.map((item) => ({
    finding: item.req.requirement.title,
    priority: item.severity === 'blocker' ? ('high' as const) : ('medium' as const),
    remediationSteps: [
      'Review the official Shopify documentation.',
      'Verify current implementation against requirements.',
      'Test changes in a dev store before submission.',
    ],
    estimatedEffort: 'Varies by requirement',
    officialReference: item.req.requirement.officialLink,
  }));

  // ──────────────────────────────────────────────────────────────────────────
  // Build executive summary
  // ──────────────────────────────────────────────────────────────────────────

  const summaryParts: string[] = [];
  summaryParts.push(
    `This experimental scan analyzed ${scan.findings.length} requirements from the Shopify App Store registry (v${scan.registryVersion}).`,
  );

  if (status === 'ready_for_submission_review') {
    summaryParts.push(
      'No blockers were detected in automated checks, and manual reviews are complete. The app may proceed to Shopify App Store submission review.',
    );
  } else if (status === 'not_ready') {
    summaryParts.push(
      `${counts.blockers} blocker(s) must be resolved before submission. ${staleBlockers.length > 0 ? `${staleBlockers.length} requirement(s) have not been verified recently and should be re-checked.` : ''}`,
    );
  } else if (status === 'needs_review') {
    summaryParts.push(
      `All blockers are clear, but ${counts.manualReviewRequired} item(s) require manual verification and ${counts.unknown > 0 ? `${counts.unknown} item(s) have unknown applicability.` : ''}`,
    );
  } else {
    summaryParts.push(`${counts.warnings} warning(s) should be reviewed before submission.`);
  }

  const limitations = [
    'This is an experimental check and does not constitute Shopify approval.',
    'Automated checks cover only the requirements we have implemented.',
    'Many App Store requirements cannot be fully assessed without store access or manual inspection.',
    'Final approval is determined by the Shopify App Store review team.',
    'Always refer to the official Shopify App Store documentation for the authoritative list of requirements.',
  ];

  const disclaimers = [
    '(EXPERIMENTAL) This tool is in development and is not an official Shopify product.',
    'No issue detected by this check does not imply Shopify approval.',
    'SteadyFlow makes no claim of completeness or accuracy of this assessment.',
    'Consult the official Shopify App Store requirements before submitting your app.',
  ];

  return {
    generatedAt: now,
    repositoryCommitSha: scan.repositoryCommitSha,
    registryVersion: scan.registryVersion,
    registryLastVerified: registry.lastVerified,
    overallStatus: status,
    counts,
    findingsByCategory,
    staleDependencies: staleBlockers.map((sb) => sb.requirementId),
    limitations,
    executiveSummary: summaryParts.join(' '),
    submissionChecklist: checklist,
    recommendations,
    disclaimers,
  };
};

/**
 * Format report as JSON (for API/automation).
 */
export const formatAppStoreReportAsJson = (report: AppStoreReport): string => {
  return JSON.stringify(report, null, 2);
};

/**
 * Format report as client-ready Markdown.
 */
export const formatAppStoreReportAsMarkdown = (report: AppStoreReport): string => {
  const lines: string[] = [];

  lines.push('# Shopify App Store Readiness Report');
  lines.push('');

  lines.push('## ⚠️ Experimental Disclaimer');
  lines.push(report.disclaimers.map((d) => `- ${d}`).join('\n'));
  lines.push('');

  lines.push('## Summary');
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(`- **Repository Commit:** \`${report.repositoryCommitSha}\``);
  lines.push(`- **Registry Version:** ${report.registryVersion}`);
  lines.push(`- **Registry Last Verified:** ${report.registryLastVerified}`);
  lines.push('');

  lines.push('## Overall Readiness Status');
  const statusEmoji = {
    not_ready: '❌',
    needs_review: '🔍',
    conditionally_ready: '⚠️',
    ready_for_submission_review: '✅',
  };
  lines.push(`**${statusEmoji[report.overallStatus]} ${report.overallStatus.toUpperCase()}**`);
  lines.push('');

  lines.push('## Findings Summary');
  lines.push(`- **Blockers:** ${report.counts.blockers}`);
  lines.push(`- **Warnings:** ${report.counts.warnings}`);
  lines.push(`- **Manual Review Required:** ${report.counts.manualReviewRequired}`);
  lines.push(`- **Unknown:** ${report.counts.unknown}`);
  lines.push(`- **Pass:** ${report.counts.pass}`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push(report.executiveSummary);
  lines.push('');

  lines.push('## Submission Checklist');
  for (const item of report.submissionChecklist) {
    const marker = item.status === 'pass' ? '✅' : item.status === 'not_applicable' ? '⊘' : '❌';
    lines.push(`${marker} ${item.item}`);
  }
  lines.push('');

  if (report.recommendations.length > 0) {
    lines.push('## Recommended Remediation');
    for (const rec of report.recommendations) {
      lines.push(`### ${rec.finding}`);
      lines.push(`**Priority:** ${rec.priority}`);
      lines.push(`**Steps:**`);
      for (const step of rec.remediationSteps) {
        lines.push(`- ${step}`);
      }
      if (rec.estimatedEffort) {
        lines.push(`**Estimated Effort:** ${rec.estimatedEffort}`);
      }
      lines.push(`**Official Reference:** [${rec.officialReference}](${rec.officialReference})`);
      lines.push('');
    }
  }

  lines.push('## Findings by Category');
  for (const [category, findings] of Object.entries(report.findingsByCategory)) {
    lines.push(`### ${category}`);
    for (const finding of findings) {
      lines.push(`- **${finding.requirement.title}** [${finding.requirement.id}]`);
      lines.push(`  - Status: ${finding.status}`);
      lines.push(`  - Link: [${finding.requirement.officialLink}](${finding.requirement.officialLink})`);
      if (finding.evidence) {
        lines.push(`  - Evidence: ${JSON.stringify(finding.evidence)}`);
      }
    }
    lines.push('');
  }

  lines.push('## Limitations');
  for (const limit of report.limitations) {
    lines.push(`- ${limit}`);
  }
  lines.push('');

  return lines.join('\n');
};
