import { describe, it, expect } from 'vitest';
import {
  ManualReviewEvidenceSchema,
  ReviewDecisionSchema,
  WaiverSchema,
  ManualReviewItemSchema,
  generateMarkdownChecklist,
  generateChecklistItems,
  type ManualReviewChecklistItem,
} from './manual-review';

describe('Manual Review Module', () => {
  describe('Zod Schemas', () => {
    it('ManualReviewEvidenceSchema validates valid evidence', () => {
      const evidence = {
        type: 'screenshot' as const,
        url: 'https://example.com/screenshot.png',
        content: 'base64...',
        description: 'OAuth flow screenshot',
        capturedAt: '2026-08-02T12:00:00Z',
        capturedBy: 'reviewer@example.com',
      };
      const result = ManualReviewEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(true);
    });

    it('ManualReviewEvidenceSchema rejects invalid type', () => {
      const evidence = {
        type: 'invalid',
        description: 'Test',
        capturedAt: '2026-08-02T12:00:00Z',
        capturedBy: 'reviewer',
      };
      const result = ManualReviewEvidenceSchema.safeParse(evidence);
      expect(result.success).toBe(false);
    });

    it('ReviewDecisionSchema accepts valid decisions', () => {
      const decisions = ['approved', 'rejected', 'conditional', 'deferred'];
      for (const d of decisions) {
        const result = ReviewDecisionSchema.safeParse(d);
        expect(result.success).toBe(true);
      }
    });

    it('ReviewDecisionSchema rejects invalid decision', () => {
      const result = ReviewDecisionSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });

    it('WaiverSchema validates valid waiver', () => {
      const waiver = {
        id: 'waiver-001',
        reason: 'Legacy system integration',
        grantedBy: 'admin@example.com',
        grantedAt: '2026-08-02T12:00:00Z',
        expiresAt: '2026-12-31T23:59:59Z',
        conditions: ['Monitor monthly', 'Report incidents'],
      };
      const result = WaiverSchema.safeParse(waiver);
      expect(result.success).toBe(true);
    });

    it('ManualReviewItemSchema validates complete review item', () => {
      const item = {
        requirementId: 'oauth-installation',
        requirementVersion: '1.0.0',
        reviewerId: 'reviewer@example.com',
        reviewerName: 'John Reviewer',
        decision: 'approved' as const,
        evidence: [
          {
            type: 'screenshot' as const,
            url: 'https://example.com/evidence.png',
            description: 'OAuth flow working',
            capturedAt: '2026-08-02T12:00:00Z',
            capturedBy: 'reviewer@example.com',
          },
        ],
        applicabilityDecision: 'applicable' as const,
        applicabilityReason: 'Public embedded app',
        waiver: undefined,
        reviewedAt: '2026-08-02T14:00:00Z',
        notes: 'All good',
      };
      const result = ManualReviewItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });
  });

  describe('generateChecklistItems', () => {
    const mockRequirements = [
      {
        id: 'oauth-installation',
        title: 'OAuth Installation',
        description: 'App must use Shopify OAuth',
        category: 'authentication',
        severity: 'blocker',
        validationMode: 'automatic' as const,
        officialSourceUrl: 'https://shopify.dev/docs/apps/getting-started/authentication',
        officialSourceTitle: 'Shopify App Authentication',
        version: '1.0.0',
      },
      {
        id: 'embedded-app',
        title: 'Embedded App',
        description: 'Embedded apps must use App Bridge',
        category: 'functionality',
        severity: 'warning',
        validationMode: 'manual' as const,
        officialSourceUrl: 'https://shopify.dev/docs/apps/tools/app-bridge',
        officialSourceTitle: 'App Bridge',
        version: '1.0.0',
      },
    ];

    it('generates checklist items with correct structure', () => {
      const items = generateChecklistItems(mockRequirements);
      expect(items.length).toBe(2);
      expect(items[0]).toMatchObject({
        requirementId: 'oauth-installation',
        requirementTitle: 'OAuth Installation',
        category: 'authentication',
        severity: 'blocker',
        validationMode: 'automatic',
        status: 'pending',
      });
      expect(items[1]?.requirementId).toBe('embedded-app');
    });
  });

  describe('generateMarkdownChecklist', () => {
    const baseMetadata = {
      appName: 'Test App',
      appId: 'test-app-123',
      generatedAt: '2026-08-02T15:00:00Z',
      generatedBy: 'system@example.com',
      totalItems: 2,
      completedItems: 1,
    };

    const checklistItems: ManualReviewChecklistItem[] = [
      {
        requirementId: 'oauth-installation',
        requirementTitle: 'OAuth Installation',
        requirementDescription: 'App must use Shopify OAuth for authentication',
        category: 'authentication',
        severity: 'blocker',
        validationMode: 'automatic',
        officialSourceUrl: 'https://shopify.dev/docs/apps/getting-started/authentication',
        officialSourceTitle: 'Shopify App Authentication',
        status: 'completed',
      },
      {
        requirementId: 'embedded-app',
        requirementTitle: 'Embedded App',
        requirementDescription: 'Embedded apps must use App Bridge',
        category: 'functionality',
        severity: 'warning',
        validationMode: 'manual',
        officialSourceUrl: 'https://shopify.dev/docs/apps/tools/app-bridge',
        officialSourceTitle: 'App Bridge',
        status: 'pending',
      },
    ];

    it('generates markdown with header and metadata', () => {
      const markdown = generateMarkdownChecklist(checklistItems, baseMetadata);
      expect(markdown).toContain('# Manual Review Checklist: Test App');
      expect(markdown).toContain('**App ID:** test-app-123');
      expect(markdown).toContain('**Progress:** 1/2 completed');
    });

    it('groups items by category', () => {
      const markdown = generateMarkdownChecklist(checklistItems, baseMetadata);
      expect(markdown).toContain('## Authentication');
      expect(markdown).toContain('## Functionality');
    });

    it('shows completed status with checkmark', () => {
      const markdown = generateMarkdownChecklist(checklistItems, baseMetadata);
      expect(markdown).toContain('✅ OAuth Installation');
      expect(markdown).toContain('⬜ Embedded App');
    });

    it('includes review item details when present', () => {
      const itemsWithReview: ManualReviewChecklistItem[] = [
        {
          requirementId: 'oauth-installation',
          requirementTitle: 'OAuth Installation',
          requirementDescription: 'App must use Shopify OAuth for authentication',
          category: 'authentication',
          severity: 'blocker',
          validationMode: 'automatic',
          officialSourceUrl: 'https://shopify.dev/docs/apps/getting-started/authentication',
          officialSourceTitle: 'Shopify App Authentication',
          status: 'completed',
          reviewItem: {
            requirementId: 'oauth-installation',
            requirementVersion: '1.0.0',
            reviewerId: 'reviewer@example.com',
            reviewerName: 'John Reviewer',
            decision: 'approved',
            evidence: [
              {
                type: 'screenshot',
                url: 'https://example.com/evidence.png',
                description: 'OAuth flow working',
                capturedAt: '2026-08-02T12:00:00Z',
                capturedBy: 'reviewer@example.com',
              },
            ],
            applicabilityDecision: 'applicable',
            applicabilityReason: 'Public embedded app',
            reviewedAt: '2026-08-02T14:00:00Z',
            notes: 'All good',
          },
        },
      ];
      const markdown = generateMarkdownChecklist(itemsWithReview, {
        ...baseMetadata,
        totalItems: 1,
        completedItems: 1,
      });
      expect(markdown).toContain('**Review Status:** Completed');
      expect(markdown).toContain('**Decision:** approved');
      expect(markdown).toContain('**Reviewer:** John Reviewer');
      expect(markdown).toContain('**Evidence:**');
      expect(markdown).toContain('screenshot: OAuth flow working');
      expect(markdown).toContain('[Link](https://example.com/evidence.png)');
    });

    it('includes waiver information when present', () => {
      const itemsWithWaiver: ManualReviewChecklistItem[] = [
        {
          requirementId: 'oauth-installation',
          requirementTitle: 'OAuth Installation',
          requirementDescription: 'App must use Shopify OAuth for authentication',
          category: 'authentication',
          severity: 'blocker',
          validationMode: 'automatic',
          officialSourceUrl: 'https://shopify.dev/docs/apps/getting-started/authentication',
          officialSourceTitle: 'Shopify App Authentication',
          status: 'completed',
          reviewItem: {
            requirementId: 'oauth-installation',
            requirementVersion: '1.0.0',
            reviewerId: 'reviewer@example.com',
            reviewerName: 'John Reviewer',
            decision: 'conditional',
            evidence: [],
            applicabilityDecision: 'applicable',
            waiver: {
              id: 'waiver-001',
              reason: 'Legacy integration',
              grantedBy: 'admin@example.com',
              grantedAt: '2026-08-02T12:00:00Z',
              expiresAt: '2026-12-31T23:59:59Z',
              conditions: ['Monitor monthly'],
            },
            reviewedAt: '2026-08-02T14:00:00Z',
          },
        },
      ];
      const markdown = generateMarkdownChecklist(itemsWithWaiver, {
        ...baseMetadata,
        totalItems: 1,
        completedItems: 1,
      });
      expect(markdown).toContain('**Waiver:** waiver-001');
      expect(markdown).toContain('granted by admin@example.com');
      expect(markdown).toContain('Monitor monthly');
    });
  });
});