/**
 * Edge Function handlers for SteadyFlow BFF.
 *
 * Each function exports a `handler(req: Request): Promise<Response>` that:
 *   1. Handles CORS
 *   2. Creates context (auth + Supabase client)
 *   3. Validates input
 *   4. Checks rate limits
 *   5. Executes business logic
 *   6. Writes audit log
 *   7. Returns typed JSON response
 *
 * These are designed to be tested with vitest against local Supabase.
 * The Deno serve wrapper is a thin adapter around these handlers.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@steadyflow/db';
import { redactSecrets, hashObject } from '@steadyflow/core';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Redact secret-shaped keys before hashing — never hash raw provider keys into the audit log. */
export const hashInput = (obj: unknown): string => hashObject(redactSecrets(obj));

export interface HandlerCtx {
  req: Request;
  supabase: SupabaseClient<Database>;
  userId: string;
  orgId: string;
  body: unknown;
}

/** Fire-and-forget audit write — logs to console.error on failure instead of swallowing it. */
const auditInsert = (
  supabase: SupabaseClient<Database>,
  row: Database['public']['Tables']['audit_log']['Insert'],
): void => {
  void supabase
    .from('audit_log')
    .insert(row)
    .then(({ error }) => {
      if (error) console.error('audit_log insert failed:', error.message);
    });
};

// ── Zod schemas (mirrored from @steadyflow/core) ───────────────────────────

export const AnalyzeShopInput = z.object({
  platform: z.enum(['shopify', 'etsy', 'amazon']),
  url: z.string().url().max(2048),
  idempotencyKey: z.string().min(1).max(255),
  requiresAuth: z.boolean().default(false),
});

export const ListQuery = z.object({
  category: z.enum([
    'pricing', 'positioning', 'product_mix', 'marketing',
    'seo', 'conversion', 'inventory', 'trend',
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const AuditQuery = z.object({
  action: z.string().optional(),
  outcome: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const KeysSetInput = z.object({
  provider: z.enum(['firecrawl','hunter','tavily','deepseek','nvidia-nim','groq','openai-compatible']),
  rawKey: z.string().min(1),
});

/** Postgres bytea expects native \x<hex> text format, not base64. */
const textToBytea = (s: string): string => '\\x' + Buffer.from(s, 'utf8').toString('hex');

export const KeysTestInput = z.object({
  provider: z.enum(['firecrawl','hunter','tavily','deepseek','nvidia-nim','groq','openai-compatible']),
});

export const LlmConfigInput = z.object({
  provider: z.enum(['deepseek', 'nvidia-nim', 'groq', 'openai-compatible']),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().min(1).max(200),
});

export const IntentCancelInput = z.object({
  intentId: z.string().uuid(),
});

export const IntentListQuery = z.object({
  kind: z.enum(['analyze_shop','analyze_product','enrich_contact','monitor_competitor']).optional(),
  status: z.enum(['queued','running','succeeded','failed','cancelled','rate_limited']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ── Response helpers ────────────────────────────────────────────────────────

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-request-id',
};

export const handleCors = (req: Request): Response | null => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  return null;
};

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...corsHeaders } });

export const badRequest = (msg: string): Response =>
  json({ error: { code: 'VALIDATION_FAILED', message: msg } }, 400);

export const unauthorized = (): Response =>
  json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } }, 401);

export const notFound = (): Response =>
  json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } }, 404);

export const internal = (msg: string): Response =>
  json({ error: { code: 'INTERNAL', message: msg } }, 500);

// ── Handler implementations ─────────────────────────────────────────────────

export const analyzeShop = async (ctx: HandlerCtx): Promise<Response> => {
  const parsed = AnalyzeShopInput.safeParse(ctx.body);
  if (!parsed.success) return badRequest('Invalid input');

  const input = parsed.data;
  const inputHash = hashInput({ platform: input.platform, url: input.url });

  // Create intent
  const { data: intent, error } = await ctx.supabase
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

  if (error) {
    if (error.code === '23505') {
      // Duplicate idempotency key — return existing
      const { data: existing } = await ctx.supabase
        .from('intents')
        .select('id, status')
        .eq('org_id', ctx.orgId)
        .eq('idempotency_key', input.idempotencyKey)
        .single();
      if (existing) return json({ intentId: existing.id, status: existing.status });
    }
    return internal(`Failed to create intent: ${error.message}`);
  }

  // Enqueue scrape via pgmq wrapper
  const { error: qError } = await ctx.supabase.rpc('enqueue_message', {
    p_queue_name: 'q:scrape',
    p_message: {
      intentId: intent.id,
      orgId: ctx.orgId,
      platform: input.platform,
      url: input.url,
      requiresAuth: input.requiresAuth,
    },
  });

  if (qError) {
    await ctx.supabase.from('intents').update({ status: 'failed', error_code: 'QUEUE_FAILED', error_message: qError.message }).eq('id', intent.id);
    return internal('Failed to queue analysis job');
  }

  // Audit
  auditInsert(ctx.supabase, {
    org_id: ctx.orgId,
    user_id: ctx.userId,
    action: 'intent.create',
    outcome: 'success',
    input_hash: inputHash,
    duration_ms: 0,
    idempotency_key: input.idempotencyKey,
    metadata: {},
  });

  return json({ intentId: intent.id, status: intent.status });
};

export const listInsights = async (ctx: HandlerCtx): Promise<Response> => {
  const url = new URL(ctx.req.url);
  const raw = Object.fromEntries(url.searchParams);
  const parsed = ListQuery.safeParse(raw);
  if (!parsed.success) return badRequest('Invalid query parameters');

  const { category, limit, cursor } = parsed.data;

  let query = ctx.supabase
    .from('insights')
    .select('*')
    .eq('org_id', ctx.orgId)
    .order('generated_at', { ascending: false })
    .limit(limit + 1);

  if (category) query = query.eq('category', category);
  if (cursor) query = query.lt('generated_at', cursor);

  const { data, error } = await query;
  if (error) return internal(error.message);

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? items[items.length - 1]?.generated_at : undefined;

  return json({ items, nextCursor });
};

export const auditQuery = async (ctx: HandlerCtx): Promise<Response> => {
  const url = new URL(ctx.req.url);
  const raw = Object.fromEntries(url.searchParams);
  const parsed = AuditQuery.safeParse(raw);
  if (!parsed.success) return badRequest('Invalid query parameters');

  const { action, outcome, limit, cursor } = parsed.data;

  let query = ctx.supabase
    .from('audit_log')
    .select('*')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (action) query = query.eq('action', action);
  if (outcome) query = query.eq('outcome', outcome);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return internal(error.message);

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? items[items.length - 1]?.created_at : undefined;

  return json({ items, nextCursor });
};

export const keysSet = async (ctx: HandlerCtx): Promise<Response> => {
  const parsed = KeysSetInput.safeParse(ctx.body);
  if (!parsed.success) return badRequest('Invalid input');

  const input = parsed.data;
  const inputHash = hashInput({ provider: input.provider });

  const { data: wrappedKey, error: wrapError } = await ctx.supabase.rpc('wrap_dek', {
    p_dek: textToBytea(input.rawKey),
  });
  if (wrapError) return internal(`Failed to encrypt key: ${wrapError.message}`);

  const { data, error } = await ctx.supabase
    .from('keys_envelopes')
    .upsert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      provider: input.provider,
      wrapped_key: wrappedKey,
      created_at: new Date().toISOString(),
    }, { onConflict: 'org_id, provider' })
    .select('provider, created_at')
    .single();

  if (error) return internal(`Failed to store key: ${error.message}`);

  auditInsert(ctx.supabase, {
    org_id: ctx.orgId, user_id: ctx.userId,
    action: 'keys.set', outcome: 'success',
    input_hash: inputHash, duration_ms: 0,
    provider: input.provider, metadata: {},
  });

  return json(data);
};

export const keysList = async (ctx: HandlerCtx): Promise<Response> => {
  const { data, error } = await ctx.supabase
    .from('keys_envelopes')
    .select('provider, created_at, rotated_at')
    .eq('org_id', ctx.orgId);

  if (error) return internal(error.message);
  return json(data);
};

export const keysTest = async (ctx: HandlerCtx): Promise<Response> => {
  const parsed = KeysTestInput.safeParse(ctx.body);
  if (!parsed.success) return badRequest('Invalid input');

  const { provider } = parsed.data;
  const start = Date.now();

  // Look up the key envelope
  const { error } = await ctx.supabase
    .from('keys_envelopes')
    .select('provider')
    .eq('org_id', ctx.orgId)
    .eq('provider', provider)
    .single();

  if (error) return notFound();

  // For MVP, just verify the key exists and return a latency measurement.
  // The actual unwrap+test-call is handled by the proxy functions.
  const latencyMs = Date.now() - start;

  auditInsert(ctx.supabase, {
    org_id: ctx.orgId, user_id: ctx.userId,
    action: 'keys.test', outcome: 'success',
    input_hash: hashInput({ provider }),
    duration_ms: latencyMs, provider, metadata: {},
  });

  return json({ provider, ok: true, latencyMs });
};

export const orgLlmConfigGet = async (ctx: HandlerCtx): Promise<Response> => {
  const { data, error } = await ctx.supabase
    .from('orgs')
    .select('default_llm_provider, default_llm_base_url, default_llm_model')
    .eq('id', ctx.orgId)
    .single();

  if (error) return notFound();

  return json({
    provider: data.default_llm_provider,
    baseUrl: data.default_llm_base_url,
    defaultModel: data.default_llm_model,
  });
};

export const orgLlmConfigSet = async (ctx: HandlerCtx): Promise<Response> => {
  const parsed = LlmConfigInput.safeParse(ctx.body);
  if (!parsed.success) return badRequest('Invalid input');

  const { provider, baseUrl, defaultModel } = parsed.data;

  const { data, error } = await ctx.supabase
    .from('orgs')
    .update({
      default_llm_provider: provider,
      default_llm_base_url: baseUrl ?? null,
      default_llm_model: defaultModel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.orgId)
    .select('default_llm_provider, default_llm_base_url, default_llm_model')
    .single();

  if (error) return internal(error.message);

  auditInsert(ctx.supabase, {
    org_id: ctx.orgId, user_id: ctx.userId,
    action: 'org_llm_config.set', outcome: 'success',
    input_hash: hashInput({ provider }),
    duration_ms: 0, metadata: {},
  });

  return json({
    provider: data.default_llm_provider,
    baseUrl: data.default_llm_base_url,
    defaultModel: data.default_llm_model,
  });
};

export const intentList = async (ctx: HandlerCtx): Promise<Response> => {
  const url = new URL(ctx.req.url);
  const raw = Object.fromEntries(url.searchParams);
  const parsed = IntentListQuery.safeParse(raw);
  if (!parsed.success) return badRequest('Invalid query parameters');

  const { kind, status, limit, cursor } = parsed.data;

  let query = ctx.supabase
    .from('intents')
    .select('id, kind, status, input_hash, idempotency_key, created_at, updated_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (kind) query = query.eq('kind', kind);
  if (status) query = query.eq('status', status);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return internal(error.message);

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? items[items.length - 1]?.created_at : undefined;

  return json({ items, nextCursor });
};

export const intentCancel = async (ctx: HandlerCtx): Promise<Response> => {
  const parsed = IntentCancelInput.safeParse(ctx.body);
  if (!parsed.success) return badRequest('Invalid input');

  const { intentId } = parsed.data;

  const { data, error } = await ctx.supabase
    .from('intents')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', intentId)
    .eq('org_id', ctx.orgId)
    .select('id, status')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return notFound(); // no rows
    return internal(error.message);
  }

  auditInsert(ctx.supabase, {
    org_id: ctx.orgId, user_id: ctx.userId,
    action: 'intent.cancel', outcome: 'success',
    input_hash: hashInput({ intentId }),
    duration_ms: 0, metadata: {},
  });

  return json({ intentId: data.id, status: data.status });
};
