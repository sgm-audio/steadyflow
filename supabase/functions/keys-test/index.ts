/**
 * keys/test — Test a provider key by verifying it exists in the envelope store.
 *
 * POST /keys/test
 * Auth: required
 * Body: { provider: string }
 */
import { z } from 'npm:zod@3';
import {
  handleCors,
  createContext,
  parseInput,
  writeAudit,
  ok,
  badRequest,
  notFound,
  internalError,
} from '../_shared/context.ts';

const KeysTestInput = z.object({
  provider: z.enum(['firecrawl','hunter','tavily','deepseek','nvidia-nim','groq','openai-compatible']),
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

  const parsed = parseInput(KeysTestInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const { provider } = parsed.value;
  const startMs = Date.now();

  const { data, error } = await ctx.supabase
    .from('keys_envelopes')
    .select('provider, created_at')
    .eq('org_id', ctx.orgId)
    .eq('provider', provider)
    .single();

  if (error || !data) return notFound('Key');

  const durationMs = Date.now() - startMs;

  writeAudit(ctx.supabase, {
    orgId: ctx.orgId, userId: ctx.userId,
    action: 'keys.test', outcome: 'success',
    input: { provider },
    durationMs,
  }).catch(() => {});

  return ok({ provider, ok: true, latencyMs: durationMs });
});
