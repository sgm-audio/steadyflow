/**
 * keys/set — Store a wrapped provider key.
 *
 * POST /keys/set
 * Auth: required
 */
import { z } from 'npm:zod@3';
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
  rawKey: z.string().min(1),
});

/** Postgres bytea expects native \x<hex> text format, not base64. */
const textToBytea = (s: string): string => '\\x' + Array.from(new TextEncoder().encode(s))
  .map((b) => b.toString(16).padStart(2, '0')).join('');

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

  const { data: wrappedKey, error: wrapError } = await ctx.supabase.rpc('wrap_dek', {
    p_dek: textToBytea(input.rawKey),
  });
  if (wrapError) return internalError(`Failed to encrypt key: ${wrapError.message}`);

  const { data, error } = await ctx.supabase
    .from('keys_envelopes')
    .upsert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      provider: input.provider,
      wrapped_key: wrappedKey,
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
