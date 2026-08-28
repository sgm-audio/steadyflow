import { z } from 'zod';

export const InsightId = z.string().uuid().brand<'InsightId'>();
export type InsightId = z.infer<typeof InsightId>;

/**
 * 12 categories aligned to the 200-pt audit taxonomy (see TODO.md / S2).
 * Every insight produced by the audit pipeline must map to one of these.
 */
export const InsightCategory = z.enum([
  'pricing',
  'positioning',
  'product_mix',
  'marketing',
  'seo',
  'conversion',
  'inventory',
  'trend',
  'ai_agent_readiness',
  'first_sale_math',
  'channel_gap',
  'creator_playbook',
]);
export type InsightCategory = z.infer<typeof InsightCategory>;

export const InsightSeverity = z.enum(['low', 'medium', 'high']);
export type InsightSeverity = z.infer<typeof InsightSeverity>;

export const Insight = z
  .object({
    id: InsightId,
    category: InsightCategory,
    severity: InsightSeverity,
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    /** Citations back to source data (source IDs, URLs). Analyzer must populate. */
    citations: z
      .array(
        z.object({
          sourceId: z.string().uuid(),
          url: z.string().url().optional(),
          excerpt: z.string().max(500).optional(),
        }),
      )
      .max(20),
    /** Model that produced this insight. */
    model: z.string().min(1).max(100),
    /** Provider that served the model. */
    provider: z.string().min(1).max(50),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Insight = z.infer<typeof Insight>;
