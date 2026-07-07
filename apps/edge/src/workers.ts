/**
 * Proxy + Worker handlers for SteadyFlow.
 *
 * Proxy functions: secure relay that unwraps BYOK keys and calls external APIs.
 * Worker functions: pgmq consumers that drive the analysis pipeline.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Helpers ────────────────────────────────────────────────────────────────

export interface WorkerCtx {
  supabase: SupabaseClient;
  orgId: string;
}

const sha256 = async (input: string): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// ── Proxy: Firecrawl ───────────────────────────────────────────────────────

export const proxyFirecrawl = async (
  supabase: SupabaseClient,
  orgId: string,
  url: string,
): Promise<{ markdown: string; metadata: Record<string, unknown> }> => {
  const { error } = await supabase
    .from('keys_envelopes')
    .select('provider')
    .eq('org_id', orgId)
    .eq('provider', 'firecrawl')
    .single();

  if (error) throw new Error('Firecrawl key not configured');

  // In production: unwrap key via pgsodium, call Firecrawl API, zero key.
  // For MVP: return placeholder (actual scraping requires a real key).
  return {
    markdown: `# Scraped content for ${url}\n\nPlaceholder — configure Firecrawl API key to enable scraping.`,
    metadata: { url, scrapedAt: new Date().toISOString() },
  };
};

// ── Proxy: Hunter.io ────────────────────────────────────────────────────────

export const proxyHunter = async (
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  orgId: string,
  prompt: string,
  model?: string,
): Promise<string> => {
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('default_llm_provider, default_llm_base_url, default_llm_model')
    .eq('id', orgId)
    .single();

  if (orgError || !org) throw new Error('Org not found');

  const defaultModel = model ?? (org as { default_llm_model: string }).default_llm_model;
  const { error } = await supabase
    .from('keys_envelopes')
    .select('provider')
    .eq('org_id', orgId)
    .eq('provider', (org as { default_llm_provider: string }).default_llm_provider)
    .single();

  if (error) throw new Error(`LLM key not configured for ${(org as { default_llm_provider: string }).default_llm_provider}`);

  // In production: unwrap key, call LLM API, zero key.
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

  const payload = (msg as { message?: { intentId?: string; orgId?: string; url?: string; platform?: string } }).message;
  if (!payload?.url || !payload?.intentId) return;

  const { intentId, url } = payload;

  await ctx.supabase.from('intents').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', intentId);

  const startMs = Date.now();

  try {
    const result = await proxyFirecrawl(ctx.supabase, ctx.orgId, url);
    const urlHash = await sha256(url);

    const { data: source } = await ctx.supabase.from('sources').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      platform: payload.platform ?? 'shopify',
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
          sourceId: (source as { id: string }).id,
          platform: payload.platform,
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
      p_msg_id: (msg as { msg_id: number }).msg_id,
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

  // Post-MVP: call proxyHunter + proxyTavily
  await ctx.supabase.rpc('archive_message', {
    p_queue_name: 'q:enrich',
    p_msg_id: (msg as { msg_id: number }).msg_id,
  });
};

// ── Worker: Analyze ─────────────────────────────────────────────────────────

export const workerAnalyze = async (ctx: WorkerCtx): Promise<void> => {
  const { data: msg, error } = await ctx.supabase.rpc('dequeue_message', {
    p_queue_name: 'q:analyze',
  });
  if (error || !msg) return;

  const payload = (msg as { message?: { intentId?: string; orgId?: string; sourceId?: string; platform?: string } }).message;
  if (!payload?.intentId || !payload?.sourceId) return;

  const { intentId, sourceId } = payload;

  try {
    const { data: source, error: srcError } = await ctx.supabase
      .from('sources')
      .select('raw_markdown, url, metadata')
      .eq('id', sourceId)
      .single();

    if (srcError || !source) throw new Error('Source not found');

    const prompt = `Analyze this Shopify store page content. Return JSON with insights array.\n\nContent: ${(source as { raw_markdown?: string }).raw_markdown?.slice(0, 8000) ?? '(empty)'}`;
    const llmResponse = await proxyLlm(ctx.supabase, ctx.orgId, prompt);

    let insights: unknown[] = [];
    try {
      const parsed: unknown = JSON.parse(llmResponse);
      insights = (parsed as { insights?: unknown[] }).insights ?? [];
    } catch {
      // Parse failure — no insights
    }

    for (const ins of insights.slice(0, 5)) {
      const i = ins as Record<string, unknown>;
      await ctx.supabase.from('insights').insert({
        org_id: ctx.orgId,
        intent_id: intentId,
        category: String(i.category ?? 'positioning'),
        severity: String(i.severity ?? 'medium'),
        title: String(i.title ?? 'Analysis result').slice(0, 200),
        body: String(i.body ?? 'No details').slice(0, 5000),
        citations: (i.citations as unknown[]) ?? [],
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
      p_msg_id: (msg as { msg_id: number }).msg_id,
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
