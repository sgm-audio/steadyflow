/**
 * proxy/hunter — Search for email addresses on a domain via Hunter.io.
 *
 * POST /proxy/hunter
 * Auth: required
 * Rate limit: hunter bucket
 */
import { z } from 'npm:zod@3';
import {
  handleCors,
  createContext,
  parseInput,
  checkRateLimit,
  writeAudit,
  unwrapProviderKey,
  ok,
  badRequest,
  internalError,
  rateLimited,
} from '../_shared/context.ts';

const HunterInput = z.object({
  domain: z.string().min(1).max(255),
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

  const parsed = parseInput(HunterInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const { domain } = parsed.value;
  const startMs = Date.now();

  const rl = await checkRateLimit(ctx.supabase, ctx.userId, ctx.orgId, 'hunter');
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  const apiKey = await unwrapProviderKey(ctx.supabase, ctx.orgId, 'hunter');
  if (!apiKey) return internalError('Hunter key not configured');

  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Hunter API error (${res.status}): ${errBody.slice(0, 200)}`);
    }
    const result = await res.json();

    writeAudit(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId,
      action: 'enrich.hunter', outcome: 'success',
      input: { domain }, provider: 'hunter',
      durationMs: Date.now() - startMs,
    }).catch(() => {});

    return ok(result);
  } catch (err) {
    return internalError(String(err));
  }
});
