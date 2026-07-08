/**
 * proxy/tavily — Search the web via Tavily API.
 *
 * POST /proxy/tavily
 * Auth: required
 * Rate limit: tavily bucket
 */
import { z } from 'zod';
import {
  handleCors,
  createContext,
  parseInput,
  checkRateLimit,
  writeAudit,
  withProviderKey,
  ok,
  badRequest,
  internalError,
  rateLimited,
} from '../_shared/context.ts';

const TavilyInput = z.object({
  query: z.string().min(1).max(1000),
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

  const parsed = parseInput(TavilyInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const { query } = parsed.value;
  const startMs = Date.now();

  const rl = await checkRateLimit(ctx.supabase, ctx.userId, ctx.orgId, 'tavily');
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  const { data: envelope, error: envError } = await ctx.supabase
    .from('keys_envelopes')
    .select('*')
    .eq('org_id', ctx.orgId)
    .eq('provider', 'tavily')
    .single();

  if (envError || !envelope) return internalError('Tavily key not configured');

  const dekWrapped = new Uint8Array((envelope as { dek_wrapped: string }).dek_wrapped.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  const ciphertext = new Uint8Array((envelope as { wrapped_key: string }).wrapped_key.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  const iv = new Uint8Array((envelope as { iv: string }).iv.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));

  try {
    const result = await withProviderKey(ctx.supabase, dekWrapped, ciphertext, iv, async (apiKey: string) => {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, api_key: apiKey, search_depth: 'basic' }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Tavily API error (${res.status}): ${errBody.slice(0, 200)}`);
      }
      return res.json();
    });

    writeAudit(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId,
      action: 'enrich.tavily', outcome: 'success',
      input: { query }, provider: 'tavily',
      durationMs: Date.now() - startMs,
    }).catch(() => {});

    return ok(result);
  } catch (err) {
    return internalError(String(err));
  }
});
