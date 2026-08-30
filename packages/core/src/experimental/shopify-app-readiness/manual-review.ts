import { z } from 'zod';

export const ManualReviewEvidenceSchema = z.object({
  type: z.enum([
    'screenshot',
    'document',
    'code_reference',
    'test_result',
    'external_link',
    'other',
  ]),
  url: z.string().url().optional(),
  content: z.string().optional(),
  description: z.string(),
  capturedAt: z.string().datetime(),
  capturedBy: z.string(),
});

export const ReviewDecisionSchema = z.enum(['approved', 'rejected', 'conditional', 'deferred']);

export const WaiverSchema = z.object({
  id: z.string(),
  reason: z.string(),
  grantedBy: z.string(),
  grantedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  conditions: z.array(z.string()).optional(),
});

export const ManualReviewItemSchema = z.object({
  requirementId: z.string(),
  requirementVersion: z.string(),
  reviewerId: z.string(),
  reviewerName: z.string(),
  decision: ReviewDecisionSchema,
  evidence: z.array(ManualReviewEvidenceSchema),
  applicabilityDecision: z.enum(['applicable', 'not_applicable', 'unknown']),
  applicabilityReason: z.string().optional(),
  waiver: WaiverSchema.optional(),
  reviewedAt: z.string().datetime(),
  notes: z.string().optional(),
});

export type ManualReviewEvidence = z.infer<typeof ManualReviewEvidenceSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type Waiver = z.infer<typeof WaiverSchema>;
export type ManualReviewItem = z.infer<typeof ManualReviewItemSchema>;

export interface ManualReviewChecklistItem {
  requirementId: string;
  requirementTitle: string;
  requirementDescription: string;
  category: string;
  severity: string;
  validationMode: 'automatic' | 'manual' | 'hybrid';
  officialSourceUrl: string;
  officialSourceTitle: string;
  status?: 'pending' | 'in_review' | 'completed' | undefined;
  reviewItem?: ManualReviewItem | undefined;
}

export function generateMarkdownChecklist(
  items: ManualReviewChecklistItem[],
  metadata: {
    appName: string;
    appId: string;
    generatedAt: string;
    generatedBy: string;
    totalItems: number;
    completedItems: number;
  },
): string {
  const lines: string[] = [];

  lines.push(`# Manual Review Checklist: ${metadata.appName}`);
  lines.push('');
  lines.push(`**App ID:** ${metadata.appId}  `);
  lines.push(`**Generated:** ${metadata.generatedAt} by ${metadata.generatedBy}  `);
  lines.push(`**Progress:** ${metadata.completedItems}/${metadata.totalItems} completed`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Group by category
  const byCategory = new Map<string, ManualReviewChecklistItem[]>();
  for (const item of items) {
    const cat = item.category || 'Uncategorized';
    const categoryItems = byCategory.get(cat);
    if (categoryItems) {
      categoryItems.push(item);
    } else {
      byCategory.set(cat, [item]);
    }
  }

  for (const [category, catItems] of byCategory) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    lines.push('');

    for (const item of catItems) {
      const statusIcon =
        item.status === 'completed' ? '✅' : item.status === 'in_review' ? '🔄' : '⬜';
      lines.push(`### ${statusIcon} ${item.requirementTitle} (${item.requirementId})`);
      lines.push('');
      lines.push(`**Description:** ${item.requirementDescription}`);
      lines.push(`**Severity:** ${item.severity}  `);
      lines.push(`**Validation Mode:** ${item.validationMode}  `);
      lines.push(`**Source:** [${item.officialSourceTitle}](${item.officialSourceUrl})  `);
      lines.push('');

      if (item.reviewItem) {
        lines.push('**Review Status:** Completed');
        lines.push(`- **Decision:** ${item.reviewItem.decision}`);
        lines.push(
          `- **Reviewer:** ${item.reviewItem.reviewerName} (${item.reviewItem.reviewerId})`,
        );
        lines.push(`- **Reviewed At:** ${item.reviewItem.reviewedAt}`);
        lines.push(`- **Applicability:** ${item.reviewItem.applicabilityDecision}`);
        if (item.reviewItem.applicabilityReason) {
          lines.push(`- **Applicability Reason:** ${item.reviewItem.applicabilityReason}`);
        }
        if (item.reviewItem.waiver) {
          lines.push(
            `- **Waiver:** ${item.reviewItem.waiver.id} (granted by ${item.reviewItem.waiver.grantedBy} at ${item.reviewItem.waiver.grantedAt})`,
          );
          if (item.reviewItem.waiver.conditions?.length) {
            lines.push(`  - **Conditions:** ${item.reviewItem.waiver.conditions.join(', ')}`);
          }
        }
        if (item.reviewItem.evidence.length) {
          lines.push('- **Evidence:**');
          for (const ev of item.reviewItem.evidence) {
            lines.push(`  - ${ev.type}: ${ev.description} (${ev.capturedAt} by ${ev.capturedBy})`);
            if (ev.url) lines.push(`    [Link](${ev.url})`);
          }
        }
        if (item.reviewItem.notes) {
          lines.push(`- **Notes:** ${item.reviewItem.notes}`);
        }
      } else {
        lines.push('**Review Status:** Pending');
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('');
  lines.push('*Generated by SteadyFlow Shopify App Readiness Module*');

  return lines.join('\n');
}

export function generateChecklistItems(
  requirements: {
    id: string;
    title: string;
    description: string;
    category: string;
    severity: string;
    validationMode: 'automatic' | 'manual' | 'hybrid';
    officialSourceUrl: string;
    officialSourceTitle: string;
  }[],
): ManualReviewChecklistItem[] {
  return requirements.map((req) => ({
    requirementId: req.id,
    requirementTitle: req.title,
    requirementDescription: req.description,
    category: req.category,
    severity: req.severity,
    validationMode: req.validationMode,
    officialSourceUrl: req.officialSourceUrl,
    officialSourceTitle: req.officialSourceTitle,
    status: 'pending' as const,
  }));
}
