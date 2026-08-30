/**
 * proxy/firecrawl — Scrape a URL via Firecrawl API.
 *
 * POST /proxy/firecrawl
 * Auth: required
 * Rate limit: firecrawl bucket
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

const FirecrawlInput = z.object({
  url: z.string().url().max(2048),
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

  const parsed = parseInput(FirecrawlInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const { url } = parsed.value;
  const startMs = Date.now();

  // Rate limit
  const rl = await checkRateLimit(ctx.supabase, ctx.userId, ctx.orgId, 'firecrawl');
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  const apiKey = await unwrapProviderKey(ctx.supabase, ctx.orgId, 'firecrawl');
  if (!apiKey) return internalError('Firecrawl key not configured');

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Firecrawl API error (${res.status}): ${errBody.slice(0, 200)}`);
    }
    const result = await res.json();

    writeAudit(ctx.supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: 'scrape.firecrawl',
      outcome: 'success',
      input: { url },
      provider: 'firecrawl',
      durationMs: Date.now() - startMs,
    }).catch(() => {});

    return ok(result);
  } catch (err) {
    return internalError(String(err));
  }
});
