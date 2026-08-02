/**
 * intel/cancel — Cancel an intent.
 *
 * POST /intel/cancel
 * Auth: required
 * Body: { intentId: string }
 */

import { z } from 'npm:zod@3';
import {
  handleCors, createContext, parseInput,
  writeAudit, ok, badRequest, notFound, internalError, jsonError,
} from '../_shared/context.ts';
import { error as sfError } from '../_shared/core-shim.ts';

const CANCELLABLE_STATUSES = ['queued', 'running'];

const CancelInput = z.object({
  intentId: z.string().uuid(),
});

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try { body = await req.json(); }
  catch { return badRequest('Invalid JSON body'); }

  const parsed = parseInput(CancelInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const { intentId } = parsed.value;
  const startMs = Date.now();

  const { data, error } = await ctx.supabase
    .from('intents')
    .update({ status: 'cancelled' })
    .eq('id', intentId)
    .eq('org_id', ctx.orgId)
    .in('status', CANCELLABLE_STATUSES)
    .select('id, status')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Either the intent doesn't exist, or it exists but is no longer in a
      // cancellable state (already succeeded/failed/cancelled) — distinguish
      // the two so a terminal-state intent isn't misreported as "not found".
      const { data: existing } = await ctx.supabase
        .from('intents')
        .select('status')
        .eq('id', intentId)
        .eq('org_id', ctx.orgId)
        .maybeSingle();
      if (existing) {
        return jsonError(
          sfError('VALIDATION_FAILED', `Intent is already ${existing.status} and can no longer be cancelled`),
          409,
        );
      }
      return notFound('Intent');
    }
    return internalError(`Failed to cancel intent: ${error.message}`);
  }

  writeAudit(ctx.supabase, {
    orgId: ctx.orgId, userId: ctx.userId,
    action: 'intent.cancel', outcome: 'success',
    input: { intentId },
    durationMs: Date.now() - startMs,
  }).catch(() => {});

  return ok({ intentId: (data as { id: string }).id, status: (data as { status: string }).status });
});
