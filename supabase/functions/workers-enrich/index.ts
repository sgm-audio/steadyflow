/**
 * workers/enrich — pgmq consumer for q:enrich.
 *
 * Dequeues enrich jobs, calls Hunter + Tavily proxies, and archives
 * the message. Post-MVP: store enrichment results in sources or a
 * dedicated context table.
 *
 * Auth: none (called internally via pgmq, uses service_role)
 */

import { createServiceRoleClient } from '../_shared/supabase.ts';

Deno.serve(async (_req: Request) => {
  const supabase = createServiceRoleClient();

  const { data: msg, error } = await supabase.rpc('dequeue_message', {
    p_queue_name: 'q:enrich',
  });

  if (error || !msg) return new Response('ok', { status: 200 });
  if (typeof msg !== 'object' || !msg) return new Response('ok', { status: 200 });

  const payload = (msg as { message?: Record<string, unknown> }).message ?? {};
  const orgId = String(payload.orgId ?? '');
  const domain = String(payload.domain ?? '');
  const query = String(payload.query ?? '');
  const _startMs = Date.now();

  try {
    if (domain) {
      await supabase.functions.invoke('proxy-hunter', { body: { domain } });
    }

    if (query) {
      await supabase.functions.invoke('proxy-tavily', { body: { query } });
    }

    // Post-MVP: store enrichment results in a context/enrichments table

    await supabase.rpc('archive_message', {
      p_queue_name: 'q:enrich',
      p_msg_id: (msg as { msg_id: number }).msg_id,
    });
  } catch {
    // Enrichment failures are non-fatal — archive and move on
    await supabase.rpc('archive_message', {
      p_queue_name: 'q:enrich',
      p_msg_id: (msg as { msg_id: number }).msg_id,
    });
  }

  return new Response('ok', { status: 200 });
});
