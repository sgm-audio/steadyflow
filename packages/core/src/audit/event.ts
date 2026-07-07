import { randomUUID } from 'node:crypto';
import type { AuditAction, AuditEvent, AuditOutcome } from '../schemas/auditEvent.js';
import { hashObject } from './hash.js';
import { redactSecrets } from './redact.js';

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

export const buildAuditEvent = (input: BuildAuditEventInput): AuditEvent => {
  const redacted = redactSecrets(input.input);
  const event: AuditEvent = {
    id: randomUUID(),
    orgId: input.orgId,
    userId: input.userId,
    action: input.action,
    outcome: input.outcome,
    inputHash: hashObject(redacted),
    durationMs: input.durationMs,
    createdAt: new Date().toISOString(),
    metadata: input.metadata ?? {},
  };
  if (input.provider !== undefined) event.provider = input.provider;
  if (input.errorCode !== undefined) event.errorCode = input.errorCode;
  if (input.idempotencyKey !== undefined) event.idempotencyKey = input.idempotencyKey;
  return event;
};
