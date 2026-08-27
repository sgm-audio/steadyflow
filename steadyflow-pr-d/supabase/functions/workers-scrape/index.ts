/**
 * workers/scrape — pgmq consumer for q:scrape.
 *
 * Dequeues scrape jobs, calls Firecrawl proxy, inserts source records,
 * and enqueues the q:analyze message for processing.
 *
 * Auth: none (called internally via pgmq, uses service_role)
 */

import { createServiceRoleClient } from '../_shared/supabase.ts';

Deno.serve(async (_req: Request) => {
  const supabase = createServiceRoleClient();

  // Dequeue one message from q:scrape
  const { data: msg, error: deqError } = await supabase.rpc('dequeue_message', {
    p_queue_name: 'q:scrape',
  });

  if (deqError || !msg) return new Response('ok', { status: 200 });
  if (typeof msg !== 'object' || !msg) return new Response('ok', { status: 200 });

  const payload = (msg as { message?: Record<string, unknown> }).message ?? {};
  const intentId = String(payload.intentId ?? '');
  const orgId = String(payload.orgId ?? '');
  const url = String(payload.url ?? '');
  const platform = String(payload.platform ?? 'shopify');

  if (!intentId || !url) return new Response('ok', { status: 200 });

  await supabase.from('intents').update({ status: 'running' }).eq('id', intentId);

  const startMs = Date.now();

  try {
    // Call the Firecrawl proxy
    const proxyRes = await supabase.functions.invoke('proxy-firecrawl', {
      body: { url },
    });

    if (proxyRes.error) throw new Error(`Firecrawl proxy error: ${proxyRes.error.message}`);

    const result = proxyRes.data as { markdown?: string; metadata?: Record<string, unknown> };

    // Hash the URL for idempotency
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
    const urlHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

    // Insert source
    const { data: source, error: srcError } = await supabase
      .from('sources')
      .insert({
        org_id: orgId,
        intent_id: intentId,
        platform,
        url,
        url_hash: urlHash,
        raw_markdown: result.markdown ?? '',
        metadata: result.metadata ?? {},
      })
      .select('id')
      .single();

    if (srcError) throw new Error(`Source insert failed: ${srcError.message}`);

    // Enqueue analysis
    await supabase.rpc('enqueue_message', {
      p_queue_name: 'q:analyze',
      p_message: {
        intentId,
        orgId,
        sourceId: (source as { id: string }).id,
        platform,
      },
    });

    // Audit
    await supabase.from('audit_log').insert({
      org_id: orgId, user_id: orgId,
      action: 'scrape.firecrawl', outcome: 'success',
      input_hash: urlHash, provider: 'firecrawl',
      duration_ms: Date.now() - startMs, metadata: {},
    });

    // Archive the message
    await supabase.rpc('archive_message', {
      p_queue_name: 'q:scrape',
      p_msg_id: (msg as { msg_id: number }).msg_id,
    });
  } catch (err) {
    await supabase.from('intents').update({
      status: 'failed',
      error_code: 'SCRAPE_FAILED',
      error_message: String(err),
    }).eq('id', intentId);
  }

  return new Response('ok', { status: 200 });
});
