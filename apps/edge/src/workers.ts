/**
 * Proxy + Worker handlers for SteadyFlow.
 *
 * Proxy functions: secure relay that unwraps BYOK keys and calls external APIs.
 * Worker functions: pgmq consumers that drive the analysis pipeline.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@steadyflow/db';

// ── Helpers ────────────────────────────────────────────────────────────────

export interface WorkerCtx {
  supabase: SupabaseClient<Database>;
  orgId: string;
}

const sha256 = async (input: string): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// Matches the generated `Json` type — lets Zod prove a value is safe to
// write into a jsonb column instead of `as Json` casting past the compiler.
const JsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue)]),
);

// `dequeue_message` is declared `returns jsonb` in Postgres, so Supabase
// codegen can only give us `Json`. Parse the pgmq envelope + per-queue
// payload shape at this boundary instead of `as` casting blind trust.
const QueueEnvelope = z.object({
  msg_id: z.number(),
  message: z.unknown(),
});

const ScrapeMessage = z.object({
  intentId: z.string(),
  url: z.string(),
  platform: z.string().optional(),
});

const AnalyzeMessage = z.object({
  intentId: z.string(),
  sourceId: z.string(),
});

const LlmInsightsResponse = z.object({
  insights: z.array(z.unknown()).default([]),
});

const InsightItem = z.object({
  category: z.string().default('positioning'),
  severity: z.string().default('medium'),
  title: z.string().default('Analysis result'),
  body: z.string().default('No details'),
  citations: z.array(JsonValue).default([]),
});

// ── Proxy: Firecrawl ───────────────────────────────────────────────────────

export const proxyFirecrawl = async (
  supabase: SupabaseClient<Database>,
  orgId: string,
  url: string,
): Promise<{ markdown: string; metadata: Json }> => {
  await supabase
    .from('keys_envelopes')
    .select('provider')
    .eq('org_id', orgId)
    .eq('provider', 'firecrawl')
    .single();

  // In production: unwrap key via pgsodium, call Firecrawl API, zero key.
  // For MVP: always return placeholder, key configured or not — same
  // fallback behavior as proxyHunter/proxyTavily, so the scrape->analyze
  // pipeline completes end to end before any provider key is wired up.
  return {
    markdown: `# Scraped content for ${url}\n\nPlaceholder — configure Firecrawl API key to enable scraping.`,
    metadata: { url, scrapedAt: new Date().toISOString() },
  };
};

// ── Proxy: Hunter.io ────────────────────────────────────────────────────────

export const proxyHunter = async (
  supabase: SupabaseClient<Database>,
  orgId: string,
  _domain: string,
): Promise<Record<string, unknown>> => {
  const { error } = await supabase
    .from('keys_envelopes')
    .select('provider')
    .eq('org_id', orgId)
    .eq('provider', 'hunter')
    .single();

  if (error) return { skipped: true, reason: 'Hunter key not configured' };
  return { skipped: true, reason: 'Hunter proxy not yet implemented' };
};

// ── Proxy: Tavily ───────────────────────────────────────────────────────────

export const proxyTavily = async (
  supabase: SupabaseClient<Database>,
  orgId: string,
  _query: string,
): Promise<Record<string, unknown>> => {
  const { error } = await supabase
    .from('keys_envelopes')
    .select('provider')
    .eq('org_id', orgId)
    .eq('provider', 'tavily')
    .single();

  if (error) return { skipped: true, reason: 'Tavily key not configured' };
  return { skipped: true, reason: 'Tavily proxy not yet implemented' };
};

// ── Proxy: LLM ──────────────────────────────────────────────────────────────

export const proxyLlm = async (
  supabase: SupabaseClient<Database>,
  orgId: string,
  prompt: string,
  model?: string,
): Promise<string> => {
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('default_llm_provider, default_llm_base_url, default_llm_model')
    .eq('id', orgId)
    .single();

  if (orgError) throw new Error('Org not found');

  const defaultModel = model ?? org.default_llm_model;
  await supabase
    .from('keys_envelopes')
    .select('provider')
    .eq('org_id', orgId)
    .eq('provider', org.default_llm_provider)
    .single();

  // In production: unwrap key, call LLM API, zero key.
  // For MVP: always return placeholder, key configured or not — see
  // proxyFirecrawl for the same rationale.
  // For MVP: return placeholder analysis.
  return JSON.stringify({
    insights: [
      {
        title: `Analysis result for ${defaultModel}`,
        category: 'positioning',
        severity: 'medium',
        body: `Prompt received (${prompt.length} chars). Configure LLM API key for real analysis.`,
        citations: [],
      },
    ],
  });
};

// ── Worker: Scrape ──────────────────────────────────────────────────────────

export const workerScrape = async (ctx: WorkerCtx): Promise<void> => {
  const { data: msg, error: deqError } = await ctx.supabase.rpc('dequeue_message', {
    p_queue_name: 'q:scrape',
  });

  if (deqError || !msg) return;

  const envelope = QueueEnvelope.safeParse(msg);
  if (!envelope.success) return;
  const payload = ScrapeMessage.safeParse(envelope.data.message);
  if (!payload.success) return;

  const { intentId, url, platform } = payload.data;

  await ctx.supabase.from('intents').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', intentId);

  const startMs = Date.now();

  try {
    const result = await proxyFirecrawl(ctx.supabase, ctx.orgId, url);
    const urlHash = await sha256(url);

    const { data: source } = await ctx.supabase.from('sources').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      platform: platform ?? 'shopify',
      url,
      url_hash: urlHash,
      raw_markdown: result.markdown,
      metadata: result.metadata,
    }).select('id').single();

    if (source) {
      await ctx.supabase.rpc('enqueue_message', {
        p_queue_name: 'q:analyze',
        p_message: {
          intentId,
          orgId: ctx.orgId,
          sourceId: source.id,
          platform,
        },
      });
    }

    const durationMs = Date.now() - startMs;
    await ctx.supabase.from('audit_log').insert({
      org_id: ctx.orgId, user_id: ctx.orgId,
      action: 'scrape.firecrawl', outcome: 'success',
      input_hash: urlHash, provider: 'firecrawl',
      duration_ms: durationMs, metadata: {},
    });

    await ctx.supabase.rpc('archive_message', {
      p_queue_name: 'q:scrape',
      p_msg_id: envelope.data.msg_id,
    });
  } catch (err) {
    await ctx.supabase.from('intents').update({
      status: 'failed',
      error_code: 'SCRAPE_FAILED',
      error_message: String(err),
      updated_at: new Date().toISOString(),
    }).eq('id', intentId);
  }
};

// ── Worker: Enrich ──────────────────────────────────────────────────────────

export const workerEnrich = async (ctx: WorkerCtx): Promise<void> => {
  const { data: msg, error } = await ctx.supabase.rpc('dequeue_message', {
    p_queue_name: 'q:enrich',
  });
  if (error || !msg) return;

  const envelope = QueueEnvelope.safeParse(msg);
  if (!envelope.success) return;

  // Post-MVP: call proxyHunter + proxyTavily
  await ctx.supabase.rpc('archive_message', {
    p_queue_name: 'q:enrich',
    p_msg_id: envelope.data.msg_id,
  });
};

// ── Worker: Analyze ─────────────────────────────────────────────────────────

export const workerAnalyze = async (ctx: WorkerCtx): Promise<void> => {
  const { data: msg, error } = await ctx.supabase.rpc('dequeue_message', {
    p_queue_name: 'q:analyze',
  });
  if (error || !msg) return;

  const envelope = QueueEnvelope.safeParse(msg);
  if (!envelope.success) return;
  const payload = AnalyzeMessage.safeParse(envelope.data.message);
  if (!payload.success) return;

  const { intentId, sourceId } = payload.data;

  try {
    const { data: source, error: srcError } = await ctx.supabase
      .from('sources')
      .select('raw_markdown, url, metadata')
      .eq('id', sourceId)
      .single();

    if (srcError) throw new Error('Source not found');

    const prompt = `Analyze this Shopify store page content. Return JSON with insights array.\n\nContent: ${source.raw_markdown?.slice(0, 8000) ?? '(empty)'}`;
    const llmResponse = await proxyLlm(ctx.supabase, ctx.orgId, prompt);

    let insights: unknown[] = [];
    try {
      const parsedResponse: unknown = JSON.parse(llmResponse);
      insights = LlmInsightsResponse.parse(parsedResponse).insights;
    } catch {
      // Parse failure — no insights
    }

    for (const raw of insights.slice(0, 5)) {
      const parsedItem = InsightItem.safeParse(raw);
      if (!parsedItem.success) continue;
      const i = parsedItem.data;
      await ctx.supabase.from('insights').insert({
        org_id: ctx.orgId,
        intent_id: intentId,
        category: i.category,
        severity: i.severity,
        title: i.title.slice(0, 200),
        body: i.body.slice(0, 5000),
        citations: i.citations,
        model: 'deepseek-chat',
        provider: 'deepseek',
        generated_at: new Date().toISOString(),
      });
    }

    await ctx.supabase.from('intents').update({
      status: 'succeeded',
      updated_at: new Date().toISOString(),
    }).eq('id', intentId);

    await ctx.supabase.from('audit_log').insert({
      org_id: ctx.orgId, user_id: ctx.orgId,
      action: 'llm.chat', outcome: 'success',
      input_hash: '0'.repeat(64), provider: 'deepseek',
      duration_ms: 0, metadata: {},
    });

    await ctx.supabase.rpc('archive_message', {
      p_queue_name: 'q:analyze',
      p_msg_id: envelope.data.msg_id,
    });
  } catch (err) {
    await ctx.supabase.from('intents').update({
      status: 'failed',
      error_code: 'ANALYZE_FAILED',
      error_message: String(err),
      updated_at: new Date().toISOString(),
    }).eq('id', intentId);
  }
};
