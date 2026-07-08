/**
 * keys/set — Store a wrapped provider key.
 *
 * POST /keys/set
 * Auth: required
 */
import { z } from 'zod';
import {
  handleCors,
  createContext,
  parseInput,
  writeAudit,
  ok,
  badRequest,
  internalError,
} from '../_shared/context.ts';

const KeysSetInput = z.object({
  provider: z.enum(['firecrawl','hunter','tavily','deepseek','nvidia-nim','groq','openai-compatible']),
  wrappedKey: z.string().min(1),
  iv: z.string().min(1),
  dekWrapped: z.string().min(1),
  dekSalt: z.string().min(1),
  kdfParams: z.object({
    algo: z.enum(['argonid', 'pbkdf2-sha256']),
    mem: z.number().int().nonnegative(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
  }),
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

  const parsed = parseInput(KeysSetInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const input = parsed.value;
  const startMs = Date.now();

  const { data, error } = await ctx.supabase
    .from('keys_envelopes')
    .upsert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      provider: input.provider,
      wrapped_key: input.wrappedKey,
      iv: input.iv,
      dek_wrapped: input.dekWrapped,
      dek_salt: input.dekSalt,
      kdf_params: input.kdfParams,
    }, { onConflict: 'org_id, provider' })
    .select('provider')
    .single();

  if (error) return internalError(`Failed to store key: ${error.message}`);

  writeAudit(ctx.supabase, {
    orgId: ctx.orgId, userId: ctx.userId,
    action: 'keys.set', outcome: 'success',
    input: { provider: input.provider },
    durationMs: Date.now() - startMs,
  }).catch(() => {});

  return ok({ provider: (data as { provider: string }).provider });
});
