import { z } from 'zod';
import { AppStoreRequirementResult } from './appStoreReadiness.js';

/**
 * Canonical registry of Shopify App Store requirements.
 * - Defines the source of truth for what is being checked.
 * - Each requirement must link to an official Shopify doc and record when last verified.
 */

export const AppStoreRegistry = z.strictObject({
  version: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  lastVerified: z.string().datetime({ offset: true }),
  requirements: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      category: z.enum([
        'app_metadata',
        'privacy_security',
        'functionality',
        'performance',
        'installation',
        'documentation',
        'other',
      ]),
      severity: z.enum(['blocker', 'warning', 'info']),
      applicabilityScope: z
        .object({
          appTypes: z.array(z.string()).optional(),
          platforms: z.array(z.string()).optional(),
        })
        .optional(),
      officialLink: z.string().url(),
      lastVerifiedAt: z.string().datetime({ offset: true }),
      automated: z.boolean().default(false),
    }),
  ),
});
export type AppStoreRegistry = z.infer<typeof AppStoreRegistry>;

/**
 * Results from a single scan (combining automated + manual reviews).
 */
export const AppStoreScanResult = z.strictObject({
  registryVersion: z.string(),
  scanTimestamp: z.string().datetime({ offset: true }),
  repositoryCommitSha: z.string().length(40),
  targetAppMetadata: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      appType: z.string().optional(),
      targetPlatform: z.string().optional(),
    })
    .optional(),
  findings: z.array(AppStoreRequirementResult),
  manualReviewResults: z
    .array(
      z.strictObject({
        requirementId: z.string(),
        status: z.enum(['pass', 'fail', 'not_applicable']),
        rationale: z.string().optional(),
        reviewedAt: z.string().datetime({ offset: true }),
        reviewedBy: z.string().optional(),
      }),
    )
    .optional(),
});
export type AppStoreScanResult = z.infer<typeof AppStoreScanResult>;

/**
 * Overall readiness status with decision logic.
 */
export const AppStoreReadinessStatus = z.enum([
  'not_ready',
  'needs_review',
  'conditionally_ready',
  'ready_for_submission_review',
]);
export type AppStoreReadinessStatus = z.infer<typeof AppStoreReadinessStatus>;

/**
 * Structured App Store Readiness Report.
 */
export const AppStoreReport = z.strictObject({
  generatedAt: z.string().datetime({ offset: true }),
  repositoryCommitSha: z.string().length(40),
  registryVersion: z.string(),
  registryLastVerified: z.string().datetime({ offset: true }),
  overallStatus: AppStoreReadinessStatus,
  counts: z.strictObject({
    blockers: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    manualReviewRequired: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative(),
  }),
  findingsByCategory: z.record(z.array(AppStoreRequirementResult)),
  staleDependencies: z.array(z.string()).optional(),
  limitations: z.array(z.string()),
  executiveSummary: z.string(),
  submissionChecklist: z.array(
    z.strictObject({
      item: z.string(),
      status: z.enum(['pass', 'fail', 'manual_review', 'not_applicable']),
      requiredForSubmission: z.boolean(),
    }),
  ),
  recommendations: z.array(
    z.strictObject({
      finding: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
      remediationSteps: z.array(z.string()),
      estimatedEffort: z.string().optional(),
      officialReference: z.string().url(),
    }),
  ),
  disclaimers: z.array(z.string()),
});
export type AppStoreReport = z.infer<typeof AppStoreReport>;
