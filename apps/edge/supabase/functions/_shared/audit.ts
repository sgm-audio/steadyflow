// Audit log writer. Service-role only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { buildAuditEvent, type AuditAction, type AuditOutcome } from '@steadyflow/core';

export const writeAudit = async (
  supabase: ReturnType<typeof createClient>,
  args: {
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
  },
): Promise<void> => {
  const event = buildAuditEvent(args);
  const { error } = await supabase.from('audit_log').insert({
    id: event.id,
    org_id: event.orgId,
    user_id: event.userId,
    action: event.action,
    outcome: event.outcome,
    input_hash: event.inputHash,
    provider: event.provider ?? null,
    duration_ms: event.durationMs,
    error_code: event.errorCode ?? null,
    idempotency_key: event.idempotencyKey ?? null,
    metadata: event.metadata,
    created_at: event.createdAt,
  });
  if (error) {
    // Audit failures must be visible but never block the request.
    console.error('audit_log insert failed', { action: args.action, error: error.message });
  }
};
