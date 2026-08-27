/**
 * intel/analyze-shop — Submit a shop URL for analysis.
 *
 * POST /intel/analyze-shop
 * Auth: required
 * Rate limit: firecrawl bucket (standard)
 * Idempotent: yes (idempotencyKey)
 */

import { z } from 'npm:zod@3';
import {
  handleCors,
  createContext,
  parseInput,
  checkRateLimit,
  writeAudit,
  enqueue,
  ok,
  rateLimited,
  badRequest,
  internalError,
} from '../_shared/context.ts';

// Zod schema inline (mirrors @steadyflow/core AnalyzeShopInput, kept in sync by contract tests)
const AnalyzeShopInput = z.object({
  platform: z.enum(['shopify', 'etsy', 'amazon']),
  url: z.string().url().max(2048),
  idempotencyKey: z.string().min(1).max(255),
  requiresAuth: z.boolean().default(false),
});
type AnalyzeShopInput = z.infer<typeof AnalyzeShopInput>;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = parseInput(AnalyzeShopInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const input = parsed.value;
  const startMs = Date.now();

  // Rate limit — firecrawl bucket
  const rl = await checkRateLimit(ctx.supabase, ctx.userId, ctx.orgId, 'firecrawl');
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  // Hash input for idempotency
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ platform: input.platform, url: input.url })),
  );
  const inputHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Create intent (UPSERT by idempotency_key)
  const { data: intent, error: intentError } = await ctx.supabase
    .from('intents')
    .insert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      kind: 'analyze_shop',
      status: 'queued',
      input_hash: inputHash,
      idempotency_key: input.idempotencyKey,
    })
    .select('id, status')
    .single();

  if (intentError) {
    // Duplicate idempotency key — return existing intent
    if (intentError.code === '23505') {
      const { data: existing } = await ctx.supabase
        .from('intents')
        .select('id, status')
        .eq('org_id', ctx.orgId)
        .eq('idempotency_key', input.idempotencyKey)
        .single();

      if (existing) {
        return ok({ intentId: existing.id, status: existing.status });
      }
    }
    return internalError(`Failed to create intent: ${intentError.message}`);
  }

  // Enqueue scrape
  try {
    await enqueue(ctx.supabase, 'q:scrape', {
      intentId: (intent as { id: string }).id,
      orgId: ctx.orgId,
      platform: input.platform,
      url: input.url,
      requiresAuth: input.requiresAuth ?? false,
    });
  } catch (err) {
    await ctx.supabase
      .from('intents')
      .update({ status: 'failed', error_code: 'QUEUE_FAILED', error_message: String(err) })
      .eq('id', (intent as { id: string }).id);
    return internalError('Failed to queue analysis job');
  }

  // Audit (fire-and-forget)
  const durationMs = Date.now() - startMs;
  writeAudit(ctx.supabase, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: 'intent.create',
    outcome: 'success',
    input: { platform: input.platform, url: input.url },
    durationMs,
    idempotencyKey: input.idempotencyKey,
  }).catch(() => {});

  return ok({
    intentId: (intent as { id: string }).id,
    status: (intent as { status: string }).status,
  });
});
