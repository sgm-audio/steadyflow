// Type definitions for the Shopify App Store Readiness Report Generator
export interface RequirementItem {
  id: string;
  name: string;
  description: string;
  status: string;
  version: string;
  verified_at: string;
  details_url: string;
}

export interface CheckResult {
  id: string;
  name: string;
  status: string;
  message: string;
  source_url: string;
}

export interface ManualReview {
  id: string;
  reviewer: string;
  status: string;
  comments: string;
  timestamp: string;
  evidence_url: string;
}

export interface AppMetadata {
  name: string;
  description: string;
  developer: string;
  repository_url: string;
  commit_sha: string;
  target_platform: string;
  sdk_version: string;
  api_version: string;
}

export interface ReportJSON {
  executive_summary: string;
  experimental_disclaimer: string;
  target_repository: {
    repository_url: string;
    commit_sha: string;
    scan_timestamp: string;
  };
  registry: {
    version: string;
    verified_at: string;
    entries: RequirementItem[];
  };
  readiness: {
    overall_status: string;
    blocker_count: number;
    warning_count: number;
    manual_review_count: number;
    unknown_count: number;
  };
  findings: {
    by_category: Record<string, {
      count: number;
      items: {
        id: string;
        name: string;
        status: string;
        message: string;
        evidence_url: string;
      }[];
    }>;
    all_items: {
      id: string;
      category: string;
      type: string;
      status: string;
      message: string;
      evidence_url: string;
    }[];
  };
  evidence: Record<string, string>;
  recommended_remediation: string;
  official_shopify_sources: string[];
  stale_requirement_warnings: string[];
  limitations: string[];
  submission_preparation_checklist: string[];
}