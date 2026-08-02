/**
 * workers/analyze — pgmq consumer for q:analyze.
 *
 * Dequeues analysis jobs, renders the LLM prompt from scraped content,
 * calls the org's configured LLM proxy, inserts insights, and marks
 * the intent as succeeded or failed.
 *
 * Auth: none (called internally via pgmq, uses service_role)
 */

import { createServiceRoleClient } from '../_shared/supabase.ts';

Deno.serve(async (_req: Request) => {
  const supabase = createServiceRoleClient();

  const { data: msg, error } = await supabase.rpc('dequeue_message', {
    p_queue_name: 'q:analyze',
  });

  if (error || !msg) return new Response('ok', { status: 200 });
  if (typeof msg !== 'object' || !msg) return new Response('ok', { status: 200 });

  const payload = (msg as { message?: Record<string, unknown> }).message ?? {};
  const intentId = String(payload.intentId ?? '');
  const orgId = String(payload.orgId ?? '');
  const sourceId = String(payload.sourceId ?? '');
  const platform = String(payload.platform ?? 'shopify');

  if (!intentId || !sourceId) return new Response('ok', { status: 200 });

  // audit_log.user_id has a foreign key to auth.users; orgId is not a valid
  // user_id, so writing it there always silently violated the FK and
  // dropped the audit row. Fetch the intent's real creator instead.
  const { data: intentRow } = await supabase.from('intents').select('user_id').eq('id', intentId).single();
  const userId = (intentRow as { user_id: string } | null)?.user_id ?? orgId;

  const startMs = Date.now();

  try {
    // Fetch the scraped content
    const { data: source, error: srcError } = await supabase
      .from('sources')
      .select('raw_markdown, url')
      .eq('id', sourceId)
      .single();

    if (srcError || !source) throw new Error('Source not found');

    const rawContent = (source as { raw_markdown?: string }).raw_markdown ?? '';
    const content = rawContent.slice(0, 8000);

    // Build analysis prompt
    const prompt = `You are an e-commerce growth analyst. Analyze this ${platform} store page content and return JSON with an insights array.

Each insight has: title, category (pricing|positioning|product_mix|marketing|seo|conversion|inventory|trend), severity (low|medium|high), body, and citations array.

Content:
${content}`;

    // Call the LLM proxy
    const llmRes = await supabase.functions.invoke('proxy-llm', {
      body: { prompt, model: 'deepseek-chat' },
    });

    if (llmRes.error) throw new Error(`LLM proxy error: ${llmRes.error.message}`);

    const llmData = llmRes.data as { choices?: Array<{ message?: { content?: string } }> };
    const llmContent = llmData.choices?.[0]?.message?.content ?? '';

    // Parse insights
    let insights: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(llmContent) as { insights?: Array<Record<string, unknown>> };
      insights = parsed.insights?.slice(0, 5) ?? [];
    } catch {
      // Parse failure — proceed with no insights
    }

    // Insert each insight
    for (const ins of insights) {
      const citations = Array.isArray(ins.citations)
        ? (ins.citations as Array<Record<string, unknown>>).slice(0, 20).map((c: Record<string, unknown>) => ({
            sourceId,
            url: (source as { url: string }).url,
            excerpt: String(c.excerpt ?? '').slice(0, 500),
          }))
        : [];

      await supabase.from('insights').insert({
        org_id: orgId,
        intent_id: intentId,
        category: String(ins.category ?? 'positioning'),
        severity: String(ins.severity ?? 'medium'),
        title: String(ins.title ?? 'Analysis result').slice(0, 200),
        body: String(ins.body ?? 'No details').slice(0, 5000),
        citations,
        model: 'deepseek-chat',
        provider: 'deepseek',
        generated_at: new Date().toISOString(),
      });
    }

    // Mark intent succeeded
    await supabase.from('intents').update({ status: 'succeeded' }).eq('id', intentId);

    // Audit
    await supabase.from('audit_log').insert({
      org_id: orgId, user_id: userId,
      action: 'llm.chat', outcome: 'success',
      input_hash: '0'.repeat(64), provider: 'deepseek',
      duration_ms: Date.now() - startMs, metadata: {},
    });

    // Archive the message
    await supabase.rpc('archive_message', {
      p_queue_name: 'q:analyze',
      p_msg_id: (msg as { msg_id: number }).msg_id,
    });
  } catch (err) {
    await supabase.from('intents').update({
      status: 'failed',
      error_code: 'ANALYZE_FAILED',
      error_message: String(err),
    }).eq('id', intentId);
    await supabase.from('audit_log').insert({
      org_id: orgId, user_id: userId,
      action: 'llm.chat', outcome: 'error',
      input_hash: '0'.repeat(64), provider: 'deepseek',
      duration_ms: Date.now() - startMs, metadata: {},
    });
  }

  return new Response('ok', { status: 200 });
});
