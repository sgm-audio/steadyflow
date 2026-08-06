import { z } from 'zod';
import { Insight } from './insight.js';

export const EffortEstimate = z.enum(['small', 'medium', 'large']);
export type EffortEstimate = z.infer<typeof EffortEstimate>;

/** An Insight enriched with the client-report fields derived at report-generation time. */
export const ReportFinding = Insight.extend({
  confidence: z.number().min(0).max(1),
  remediation: z.string().min(1).max(1000),
  effortEstimate: EffortEstimate,
  requiredAccess: z.array(z.string().max(100)).max(5),
});
export type ReportFinding = z.infer<typeof ReportFinding>;

export const Report = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    intentId: z.string().uuid(),
    executiveSummary: z.string().min(1).max(4000),
    findings: z.array(ReportFinding),
    sprintRecommendation: z.string().min(1).max(2000),
    findingCount: z.number().int().nonnegative(),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Report = z.infer<typeof Report>;
