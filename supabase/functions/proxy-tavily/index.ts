/**
 * proxy/tavily — Search the web via Tavily API.
 *
 * POST /proxy/tavily
 * Auth: required
 * Rate limit: tavily bucket
 */
import { z } from 'npm:zod@3';
import {
  badRequest,
  checkRateLimit,
  createContext,
  handleCors,
  internalError,
  ok,
  parseInput,
  rateLimited,
  unwrapProviderKey,
  writeAudit,
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
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = parseInput(TavilyInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const { query } = parsed.value;
  const startMs = Date.now();

  const rl = await checkRateLimit(ctx.supabase, ctx.userId, ctx.orgId, 'tavily');
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  const apiKey = await unwrapProviderKey(ctx.supabase, ctx.orgId, 'tavily');
  if (!apiKey) return internalError('Tavily key not configured');

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, api_key: apiKey, search_depth: 'basic' }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Tavily API error (${res.status}): ${errBody.slice(0, 200)}`);
    }
    const result = await res.json();

    writeAudit(ctx.supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: 'enrich.tavily',
      outcome: 'success',
      input: { query },
      provider: 'tavily',
      durationMs: Date.now() - startMs,
    }).catch(() => {});

    return ok(result);
  } catch (err) {
    return internalError(String(err));
  }
});
