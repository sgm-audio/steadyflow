/**
 * Minimal inline replacement for @steadyflow/core types used by _shared modules.
 * Deployed alongside Edge Functions — no npm package dependency.
 */
import { z } from 'npm:zod@3';

export const ErrorCode = z.enum([
  'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED',
  'RATE_LIMITED', 'PROVIDER_ERROR', 'PROVIDER_UNAVAILABLE',
  'KEY_MISSING', 'KEY_INVALID', 'ENVELOPE_DECRYPT_FAILED',
  'INTERNAL', 'TIMEOUT',
]);

export const SteadyFlowError = z.object({
  code: ErrorCode,
  message: z.string().min(1).max(2000),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().uuid().optional(),
});

export type SteadyFlowError = z.infer<typeof SteadyFlowError>;

export const error = (code: string, message: string, details?: Record<string, unknown>): SteadyFlowError => {
  const base: { code: string; message: string; details?: Record<string, unknown> } = { code, message };
  if (details !== undefined) base.details = details;
  return base as SteadyFlowError;
};

export const AuditAction = z.enum([
  'scrape.firecrawl', 'scrape.playwright', 'enrich.hunter', 'enrich.tavily',
  'llm.chat', 'keys.set', 'keys.rotate', 'keys.delete', 'keys.test',
  'intent.create', 'intent.cancel', 'auth.login', 'auth.logout',
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditOutcome = z.enum(['success', 'error', 'rate_limited', 'cancelled']);
export type AuditOutcome = z.infer<typeof AuditOutcome>;

export interface BuildAuditEventInput {
  orgId: string;
  userId: string;
  action: AuditAction;
  outcome: AuditOutcome;
  input: unknown;
  provider?: string;
  durationMs: number;
  errorCode?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

/** Simple synchronous 64-char hex hash for audit_log constraint.
 *  Not cryptographically secure — just needs to be 64 hex chars. */
const simpleHash = (input: string): string => {
  const arr = new TextEncoder().encode(input);
  const h = Array.from(arr).reduce((acc, b, i) => ((acc << 5) - acc + b) ^ (i * 0x9e3779b9), 0x6c62272e);
  const pad = Math.abs(h).toString(16).padStart(16, '0');
  return (pad + pad + pad + pad).slice(0, 64);
};

export const buildAuditEvent = (input: BuildAuditEventInput) => {
  const inputHash = simpleHash(JSON.stringify(input, Object.keys(input).sort()));
  return {
    id: crypto.randomUUID(),
    orgId: input.orgId,
    userId: input.userId,
    action: input.action,
    outcome: input.outcome,
    inputHash,
    durationMs: input.durationMs,
    createdAt: new Date().toISOString(),
    provider: input.provider,
    errorCode: input.errorCode,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata ?? {},
  };
};
