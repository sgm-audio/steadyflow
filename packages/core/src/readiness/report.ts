import type { BuildReadinessReportInput, ReadinessAssessment, ReadinessFinding, ReadinessReport, ReadinessStatus } from './schemas.js';
import { BuildReadinessReportInput as InputSchema } from './schemas.js';

const DISCLAIMER = 'Readiness evidence only; this report is not a compliance guarantee or Shopify approval.' as const;

const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
};

const validateStatusForMode = (assessment: ReadinessAssessment, mode: 'automatic' | 'manual'): void => {
  if (mode === 'manual' && ['pass', 'fail', 'warning'].includes(assessment.status)) {
    throw new Error(`Manual requirement ${assessment.requirementId} cannot be resolved as ${assessment.status}`);
  }
  if (mode === 'automatic' && assessment.status === 'manual_review') {
    throw new Error(`Automatic requirement ${assessment.requirementId} cannot be resolved as manual_review`);
  }
};

export const buildReadinessReport = (rawInput: BuildReadinessReportInput): ReadinessReport => {
  const input = InputSchema.parse(rawInput);
  assertUnique(input.requirements.map(({ id }) => id), 'requirement id');
  assertUnique(input.assessments.map(({ requirementId }) => requirementId), 'assessment requirement id');
  const requirementsById = new Map(input.requirements.map((item) => [item.id, item] as const));
  for (const assessment of input.assessments) {
    const requirement = requirementsById.get(assessment.requirementId);
    if (requirement === undefined) throw new Error(`Assessment references unknown requirement ${assessment.requirementId}`);
    validateStatusForMode(assessment, requirement.verificationMode);
  }
  const assessmentsById = new Map(input.assessments.map((item) => [item.requirementId, item] as const));
  const findings: ReadinessFinding[] = input.requirements.map((requirement) => {
    const assessment = assessmentsById.get(requirement.id);
    if (assessment === undefined) {
      return { requirement, status: requirement.verificationMode === 'manual' ? 'manual_review' : 'unknown', evidence: [] };
    }
    return { requirement, status: assessment.status, evidence: assessment.evidence, ...(assessment.notes === undefined ? {} : { notes: assessment.notes }) };
  });
  const counts: Record<ReadinessStatus, number> = { pass: 0, fail: 0, warning: 0, manual_review: 0, not_applicable: 0, unknown: 0 };
  for (const finding of findings) counts[finding.status] += 1;
  const automated = findings.filter((finding) => finding.requirement.verificationMode === 'automatic' && ['pass', 'fail', 'warning'].includes(finding.status));
  const automatedPasses = automated.filter(({ status }) => status === 'pass').length;
  return {
    experimental: true,
    generatedAt: input.generatedAt,
    disclaimer: DISCLAIMER,
    findings,
    summary: {
      pass: counts.pass, fail: counts.fail, warning: counts.warning,
      manualReview: counts.manual_review, notApplicable: counts.not_applicable, unknown: counts.unknown,
      automatedScore: automated.length === 0 ? null : Math.round((automatedPasses / automated.length) * 100),
    },
  };
};
