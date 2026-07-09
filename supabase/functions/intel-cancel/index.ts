/**
 * intel/cancel — Cancel an intent.
 *
 * POST /intel/cancel
 * Auth: required
 * Body: { intentId: string }
 */

import { z } from 'zod';
import {
  handleCors, createContext, parseInput,
  writeAudit, ok, badRequest, notFound, internalError,
} from '../_shared/context.ts';

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
    .select('id, status')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return notFound('Intent');
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
