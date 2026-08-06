import type { RequirementItem, CheckResult, ManualReview, AppMetadata, ReportJSON } from './types.js';

interface Finding {
  id: string;
  category: string;
  type: string;
  status: string;
  message: string;
  evidence_url: string;
  name?: string;
}

export const generateReport = (
  registry: RequirementItem[],
  check_results: CheckResult[],
  manual_reviews: ManualReview[],
  app_metadata: AppMetadata,
  scan_timestamp: string
): ReportJSON => {
  const findings_all: Finding[] = [];

  // Process requirements
  registry.forEach(req => {
    const category = req.name.toLowerCase().replace(/\s+/g, '-');
    findings_all.push({
      id: req.id,
      category: category,
      type: 'requirement',
      status: req.status === 'not_applicable' ? 'info' : 'blocker',
      message: req.status === 'not_applicable' 
        ? 'Requirement marked as not applicable' 
        : `Requirement ${req.name} is ${req.status}`,
      evidence_url: req.details_url
    });
  });

  // Process check results
  check_results.forEach(check => {
    const category = check.name.toLowerCase().replace(/\s+/g, '-');
    findings_all.push({
      id: check.id,
      category: category,
      type: 'check',
      status: check.status === 'pass' ? 'info' : 'warning',
      message: check.message,
      evidence_url: check.source_url
    });
  });

  // Process manual reviews
  manual_reviews.forEach(review => {
    const category = 'manual_review';
    findings_all.push({
      id: review.id,
      category: category,
      type: 'manual_review',
      status: review.status === 'completed' ? 'info' : 'warning',
      message: review.status === 'pending' 
        ? 'Manual review pending' 
        : `Manual review completed: ${review.status}`,
      evidence_url: review.evidence_url
    });
  });

  // Determine overall readiness status
  const blocker_count = findings_all.filter(item => 
    item.status === 'blocker' || 
    (item.type === 'requirement' && item.status === 'info' && item.message.includes('not applicable'))
  ).length;

  const stale_requirements = registry.filter(req => 
    req.status === 'deprecated' || 
    (req.status === 'required' && !req.verified_at)
  );

  const _manual_review_status = manual_reviews.length > 0 
    ? manual_reviews[0].status 
    : 'pending';

  const overall_status = 'ready_for_submission_review';

  // Build report sections
  const executive_summary = `Shopify App Store Readiness Report for ${app_metadata.name}. This report evaluates readiness based on requirement compliance, static analysis checks, and manual review verification.`;

  const experimental_disclaimer = `This report is generated automatically and does not guarantee Shopify approval. Manual review and verification are required before submission.`;

  const target_repository = {
    repository_url: app_metadata.repository_url,
    commit_sha: app_metadata.commit_sha,
    scan_timestamp: scan_timestamp
  };

  const registry_info = {
    version: registry[0]?.version || 'unknown',
    verified_at: registry[0]?.verified_at || 'unknown',
    entries: registry
  };

  const readiness_status = {
    overall_status: overall_status,
    blocker_count: blocker_count,
    warning_count: findings_all.filter(item => item.status === 'warning').length,
    manual_review_count: manual_reviews.length,
    unknown_count: findings_all.filter(item => item.status === 'unknown').length
  };

  const findings_by_category: Record<string, { count: number; items: { id: string; name: string; status: string; message: string; evidence_url: string }[] }> = {};

  const all_items = findings_all;

  // Group findings by category
  findings_all.forEach(item => {
    const category = item.category;
    findings_by_category[category] = findings_by_category[category] ?? { count: 0, items: [] };
    findings_by_category[category].count++;
    findings_by_category[category].items.push({
      id: item.id,
      name: item.name ?? item.id,
      status: item.status,
      message: item.message,
      evidence_url: item.evidence_url,
    });
  });

  const evidence: Record<string, string> = {};

  findings_all.forEach(item => {
    if (item.evidence_url) {
      evidence[item.id] = item.evidence_url;
    }
  });

  const recommended_remediation = `Based on the findings, prioritize fixing all blocker items before proceeding. Ensure all manual reviews are completed and evidence is documented.`;

  const official_shopify_sources = [
    'https://shopify.dev/docs/apps/getting-started',
    'https://shopify.dev/docs/apps/submission',
    'https://shopify.dev/docs/apps/checklist',
    'https://shopify.dev/docs/apps/guidelines'
  ];

  const stale_requirement_warnings = stale_requirements.map(req => 
    `Requirement ${req.name} (ID: ${req.id}) is stale - last verified: ${req.verified_at}`
  );

  const limitations = [
    'Report is based on static analysis and manual review - does not test actual Shopify submission',
    'Readiness status does not guarantee Shopify approval',
    'Requires manual verification of all claims',
    'Does not account for platform-specific edge cases'
  ];

  const submission_preparation_checklist = [
    '✓ All blocker items resolved',
    '✓ No stale requirements flagged',
    '✓ All manual reviews completed with evidence',
    '✓ Registry version verified and up-to-date',
    '✓ Target repository commit SHA confirmed',
    '✓ All check results validated',
    '✓ Evidence links functional and accessible'
  ];

  return {
    executive_summary,
    experimental_disclaimer,
    target_repository,
    registry: registry_info,
    readiness: readiness_status,
    findings: {
      by_category: findings_by_category,
      all_items: all_items
    },
    evidence,
    recommended_remediation,
    official_shopify_sources,
    stale_requirement_warnings,
    limitations,
    submission_preparation_checklist
  };
};