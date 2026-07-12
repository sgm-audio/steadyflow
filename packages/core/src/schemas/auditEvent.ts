import { z } from 'zod';

export const AuditAction = z.enum([
  'scrape.firecrawl',
  'scrape.playwright',
  'enrich.tavily',
  'analyze.shopify_catalog',
  'monitor.competitor',
  'llm.chat',
  'keys.set',
  'keys.rotate',
  'keys.delete',
  'keys.test',
  'intent.create',
  'intent.cancel',
  'auth.login',
  'auth.logout',
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditOutcome = z.enum(['success', 'error', 'rate_limited', 'cancelled']);
export type AuditOutcome = z.infer<typeof AuditOutcome>;

export const AuditEvent = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    userId: z.string().uuid(),
    action: AuditAction,
    outcome: AuditOutcome,
    /** SHA-256 of redacted input. */
    inputHash: z.string().length(64),
    /** Provider called, if any. */
    provider: z.string().max(50).optional(),
    durationMs: z.number().int().nonnegative(),
    /** Error code if outcome is 'error'. */
    errorCode: z.string().max(50).optional(),
    /** Idempotency key for correlation. */
    idempotencyKey: z.string().max(255).optional(),
    /** Free-form structured metadata (no PII, no secrets). */
    metadata: z.record(z.unknown()).default({}),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AuditEvent = z.infer<typeof AuditEvent>;
