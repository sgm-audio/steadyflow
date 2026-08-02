import { z } from 'zod';

export const IntentId = z.string().uuid().brand<'IntentId'>();
export type IntentId = z.infer<typeof IntentId>;

export const IntentKind = z.enum([
  'analyze_shop',
  'analyze_product',
  'enrich_contact',
  'monitor_competitor',
]);
export type IntentKind = z.infer<typeof IntentKind>;

export const IntentStatus = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'rate_limited',
]);
export type IntentStatus = z.infer<typeof IntentStatus>;

export const Intent = z
  .object({
    id: IntentId,
    orgId: z.string().uuid(),
    userId: z.string().uuid(),
    kind: IntentKind,
    status: IntentStatus,
    /** Redacted, hashed input — never the raw payload. */
    inputHash: z.string().length(64),
    /** Idempotency key supplied by the client. */
    idempotencyKey: z.string().min(1).max(255),
    /** Optional reference to the resulting insight(s). */
    insightIds: z.array(z.string().uuid()).default([]),
    error: z
      .object({
        code: z.string().min(1).max(50),
        message: z.string().min(1).max(2000),
      })
      .optional(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Intent = z.infer<typeof Intent>;
