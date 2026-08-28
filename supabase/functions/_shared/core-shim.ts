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
  'scrape.firecrawl', 'scrape.playwright', 'enrich.tavily',
  'analyze.shopify_catalog', 'monitor.competitor',
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

/**
 * SHA-256 of a redacted input, matching @steadyflow/core's `hashObject`
 * (SHA-256 over stable-sorted-key JSON of redacted input). Web Crypto is
 * available in both Deno and Node, so the Deno audit_log `input_hash` stays
 * identical to the Node worker's — no drift.
 */
const sha256Hex = async (input: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Stable JSON serialization with sorted keys (matches core `stableStringify`). */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

const SECRET_KEY_PATTERNS = [
  /^api[_-]?key$/i, /^key$/i, /^token$/i, /^secret$/i, /^password$/i, /^pass$/i,
  /^authorization$/i, /^bearer$/i, /^cookie$/i, /^session[_-]?id$/i, /^private[_-]?key$/i,
];
const REDACTED = '[REDACTED]';

const redactSecrets = <T>(value: T): T => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as T;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_KEY_PATTERNS.some((re) => re.test(k)) ? REDACTED : redactSecrets(v);
  }
  return out as T;
};

export const buildAuditEvent = async (input: BuildAuditEventInput) => {
  const inputHash = await sha256Hex(stableStringify(redactSecrets(input.input)));
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
