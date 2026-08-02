import { z } from 'zod';

const OfficialShopifyUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === 'shopify.dev';
}, 'Official source must be an HTTPS shopify.dev URL');

export const ReadinessStatus = z.enum(['pass', 'fail', 'warning', 'manual_review', 'not_applicable', 'unknown']);
export type ReadinessStatus = z.infer<typeof ReadinessStatus>;
export const VerificationMode = z.enum(['automatic', 'manual']);

export const RequirementSource = z.strictObject({
  url: OfficialShopifyUrl,
  lastVerifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const ReadinessRequirement = z.strictObject({
  id: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  verificationMode: VerificationMode,
  source: RequirementSource,
});
export type ReadinessRequirement = z.infer<typeof ReadinessRequirement>;
export const ReadinessEvidence = z.strictObject({
  kind: z.enum(['file', 'url', 'observation', 'test']),
  locator: z.string().min(1).max(500),
  summary: z.string().min(1).max(1000),
});
export const ReadinessAssessment = z.strictObject({
  requirementId: z.string().min(1).max(50),
  status: ReadinessStatus,
  evidence: z.array(ReadinessEvidence).max(50),
  notes: z.string().min(1).max(2000).optional(),
});
export type ReadinessAssessment = z.infer<typeof ReadinessAssessment>;
export const ReadinessFinding = z.strictObject({
  requirement: ReadinessRequirement,
  status: ReadinessStatus,
  evidence: z.array(ReadinessEvidence).max(50),
  notes: z.string().min(1).max(2000).optional(),
});
export type ReadinessFinding = z.infer<typeof ReadinessFinding>;
export const ReadinessSummary = z.strictObject({
  pass: z.number().int().nonnegative(),
  fail: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  manualReview: z.number().int().nonnegative(),
  notApplicable: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  automatedScore: z.number().min(0).max(100).nullable(),
});
export const ReadinessReport = z.strictObject({
  experimental: z.literal(true),
  generatedAt: z.string().datetime(),
  disclaimer: z.literal('Readiness evidence only; this report is not a compliance guarantee or Shopify approval.'),
  findings: z.array(ReadinessFinding),
  summary: ReadinessSummary,
});
export type ReadinessReport = z.infer<typeof ReadinessReport>;
export const BuildReadinessReportInput = z.strictObject({
  requirements: z.array(ReadinessRequirement).min(1),
  assessments: z.array(ReadinessAssessment),
  generatedAt: z.string().datetime(),
});
export type BuildReadinessReportInput = z.infer<typeof BuildReadinessReportInput>;
