/**
 * workers/monitor — pgmq consumer for q:monitor.
 *
 * Dequeues competitor-monitoring jobs: tries Tavily search for price
 * discovery on the tracked competitor, falls back to directly scraping the
 * competitor's own storefront, records a snapshot, and diffs it against the
 * previous one for a real pricing insight. Implements the previously
 * defined-but-unused intents.kind = 'monitor_competitor'.
 *
 * Auth: none (called internally via pgmq, uses service_role)
 */

import { createServiceRoleClient } from '../_shared/supabase.ts';
import { unwrapProviderKey } from '../_shared/envelope.ts';

const PRICE_REGEX = /\$\d{1,4}(?:\.\d{2})?/g;

const extractPrices = (text: string): number[] =>
  (text.match(PRICE_REGEX) ?? [])
    .map((p) => Number(p.replace('$', '')))
    .filter((n) => n > 0 && n < 10000);

const isPrivateIpv4 = (ip: string): boolean =>
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

/**
 * ponytail: hostname-literal SSRF check only, not DNS-resolved like the Node
 * worker's directScrape guard (apps/edge/src/workers.ts). Acceptable ceiling
 * here because this only ever fetches a URL an org member explicitly entered
 * as a tracked competitor, not arbitrary third-party input. Upgrade path:
 * port the DNS-resolution check if this ever accepts untrusted URLs.
 */
const assertPublicUrl = (rawUrl: string): void => {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to fetch non-http(s) URL: ${url.protocol}`);
  }
  if (isPrivateIpv4(url.hostname) || url.hostname === 'localhost' || url.hostname === '::1') {
    throw new Error(`Refusing to fetch a private/loopback URL: ${url.hostname}`);
  }
};

const directScrapeText = async (url: string): Promise<string> => {
  assertPublicUrl(url);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' } });
  if (!res.ok) throw new Error(`Direct scrape failed ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);
};

Deno.serve(async (_req: Request) => {
  const supabase = createServiceRoleClient();

  const { data: msg, error: deqError } = await supabase.rpc('dequeue_message', {
    p_queue_name: 'q:monitor',
  });
  if (deqError || !msg) return new Response('ok', { status: 200 });
  if (typeof msg !== 'object' || !msg) return new Response('ok', { status: 200 });

  const payload = (msg as { message?: Record<string, unknown> }).message ?? {};
  const intentId = String(payload.intentId ?? '');
  const orgId = String(payload.orgId ?? '');
  const competitorId = String(payload.competitorId ?? '');

  if (!intentId || !orgId || !competitorId) return new Response('ok', { status: 200 });

  // audit_log.user_id has a foreign key to auth.users; orgId is not a valid
  // user_id, so writing it there always silently violated the FK and
  // dropped the audit row. Fetch the intent's real creator instead.
  const { data: runningRow } = await supabase
    .from('intents')
    .update({ status: 'running' })
    .eq('id', intentId)
    .select('user_id')
    .single();
  const userId = (runningRow as { user_id: string } | null)?.user_id ?? orgId;

  try {
    const { data: competitor, error: compError } = await supabase
      .from('competitors')
      .select('id, name, url, niche_notes')
      .eq('id', competitorId)
      .single();
    if (compError) throw new Error('Competitor not found');

    const { data: previous } = await supabase
      .from('competitor_snapshots')
      .select('price_points, captured_at')
      .eq('competitor_id', competitorId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let prices: number[] = [];
    let source: 'tavily' | 'scrape' = 'tavily';

    const tavilyKey = await unwrapProviderKey(supabase, orgId, 'tavily');
    if (tavilyKey) {
      const query = competitor.niche_notes
        ? `${competitor.name} ${competitor.niche_notes} price`
        : `${competitor.name} price`;
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query, search_depth: 'basic', max_results: 5 }),
      });
      if (res.ok) {
        const json = (await res.json()) as { results?: unknown };
        const results = Array.isArray(json.results) ? json.results : [];
        for (const r of results) {
          const content = (r as { content?: unknown }).content;
          if (typeof content === 'string') prices.push(...extractPrices(content));
        }
      }
    }

    if (prices.length === 0) {
      source = 'scrape';
      const text = await directScrapeText(competitor.url);
      prices = extractPrices(text);
    }

    const { data: snapshot } = await supabase.from('competitor_snapshots').insert({
      org_id: orgId,
      competitor_id: competitorId,
      product_count: prices.length || null,
      price_points: prices,
      source,
    }).select('id').single();

    const prevPrices = Array.isArray(previous?.price_points)
      ? (previous.price_points as unknown[]).filter((n): n is number => typeof n === 'number')
      : [];

    if (previous && prevPrices.length > 0 && prices.length > 0) {
      const prevAvg = prevPrices.reduce((a, b) => a + b, 0) / prevPrices.length;
      const currAvg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const deltaPct = prevAvg > 0 ? ((currAvg - prevAvg) / prevAvg) * 100 : 0;

      if (Math.abs(deltaPct) >= 5) {
        await supabase.from('insights').insert({
          org_id: orgId,
          intent_id: intentId,
          category: 'pricing',
          severity: Math.abs(deltaPct) >= 15 ? 'high' : 'medium',
          title: `${competitor.name} price ${deltaPct > 0 ? 'increased' : 'decreased'} ${Math.abs(deltaPct).toFixed(0)}%`,
          body: `Average tracked price moved from $${prevAvg.toFixed(2)} to $${currAvg.toFixed(2)} since the last check on ${new Date(previous.captured_at).toLocaleDateString()}.`,
          citations: [],
          model: 'competitor-monitor-v1',
          provider: source,
          generated_at: new Date().toISOString(),
        });
      }
    }

    await supabase.from('intents').update({ status: 'succeeded' }).eq('id', intentId);

    await supabase.from('audit_log').insert({
      org_id: orgId, user_id: userId,
      action: 'monitor.competitor', outcome: 'success',
      input_hash: '0'.repeat(64), provider: source,
      duration_ms: 0,
      metadata: { competitorId, priceCount: prices.length, snapshotId: (snapshot as { id: string } | null)?.id ?? null },
    });

    await supabase.rpc('archive_message', {
      p_queue_name: 'q:monitor',
      p_msg_id: (msg as { msg_id: number }).msg_id,
    });
  } catch (err) {
    await supabase.from('intents').update({
      status: 'failed',
      error_code: 'MONITOR_FAILED',
      error_message: String(err),
    }).eq('id', intentId);
    await supabase.from('audit_log').insert({
      org_id: orgId, user_id: userId,
      action: 'monitor.competitor', outcome: 'error',
      input_hash: '0'.repeat(64), provider: 'tavily',
      duration_ms: 0, metadata: { competitorId },
    });
  }

  return new Response('ok', { status: 200 });
});
