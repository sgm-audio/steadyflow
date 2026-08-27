/**
 * workers/scrape — pgmq consumer for q:scrape.
 *
 * Dequeues scrape jobs. When the org has a shopify-admin key configured and
 * the platform is 'shopify', it short-circuits to a real Shopify Admin +
 * Printify catalog audit (no Firecrawl, no LLM). Otherwise it falls back to
 * the Firecrawl proxy → LLM pipeline.
 *
 * Auth: none (called internally via pgmq, uses service_role)
 */

import { createServiceRoleClient } from '../_shared/supabase.ts';
import { unwrapProviderKey } from '../_shared/envelope.ts';

// ── Helpers ────────────────────────────────────────────────────────────────

const sha256 = async (input: string): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// ── Deno-compatible SSRF guard ─────────────────────────────────────────────

const isPrivateIpv4 = (ip: string): boolean =>
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

const isPrivateIp = (ip: string): boolean => {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)?.[1];
    return v4Mapped ? isPrivateIpv4(v4Mapped) : false;
  }
  return isPrivateIpv4(ip);
};

const assertPublicHttpUrl = async (rawUrl: string): Promise<void> => {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to scrape non-http(s) URL: ${url.protocol}`);
  }
  const addresses = await Deno.resolveDns(url.hostname, 'A');
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a))) {
    throw new Error(`Refusing to scrape URL resolving to a private address: ${url.hostname}`);
  }
};

// ── Page SEO signals (Deno-compatible) ─────────────────────────────────────

interface PageSeoSignals {
  hasMetaDescription: boolean;
  metaDescriptionLength: number;
  hasStructuredData: boolean;
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
}

const checkPageSeoSignals = async (storeUrl: string): Promise<PageSeoSignals> => {
  const base = storeUrl.replace(/\/+$/, '');

  let hasMetaDescription = false;
  let metaDescriptionLength = 0;
  let hasStructuredData = false;
  try {
    await assertPublicHttpUrl(base);
    const res = await fetch(base, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' } });
    if (res.ok) {
      const html = await res.text();
      const descMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html);
      metaDescriptionLength = descMatch?.[1]?.trim().length ?? 0;
      hasMetaDescription = metaDescriptionLength > 0;
      hasStructuredData = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
    }
  } catch {
    // Homepage unreachable — signals stay at their "missing" defaults.
  }

  const checkExists = async (path: string): Promise<boolean> => {
    try {
      const url = `${base}${path}`;
      await assertPublicHttpUrl(url);
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' } });
      return res.ok;
    } catch {
      return false;
    }
  };

  const [hasSitemap, hasRobotsTxt] = await Promise.all([
    checkExists('/sitemap.xml'),
    checkExists('/robots.txt'),
  ]);

  return { hasMetaDescription, metaDescriptionLength, hasStructuredData, hasSitemap, hasRobotsTxt };
};

// ── Shopify Admin catalog audit (Deno-compatible) ──────────────────────────

/**
 * Real per-product analysis from Shopify Admin + Printify data.
 * Delegates to workers-shopify-audit which handles the full catalog audit.
 */
const analyzeShopifyCatalog = async (
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  intentId: string,
  storeUrl: string,
): Promise<void> => {
  const adminToken = await unwrapProviderKey(supabase, orgId, 'shopify-admin');
  if (!adminToken) throw new Error('No shopify-admin key configured');
  const printifyToken = (await unwrapProviderKey(supabase, orgId, 'printify').catch(() => null)) ?? undefined;

  // Delegate to the dedicated Shopify audit edge function
  const auditRes = await supabase.functions.invoke('workers-shopify-audit', {
    body: { storeUrl, adminToken, printifyToken, orgId, intentId },
  });

  if (auditRes.error) throw new Error(`Shopify audit proxy error: ${auditRes.error.message}`);

  // Page-fetch SEO signals the Admin API doesn't expose
  const seoSignals = await checkPageSeoSignals(storeUrl);

  // Insert SEO signals that the Admin API doesn't expose
  if (!seoSignals.hasMetaDescription || seoSignals.metaDescriptionLength < 50) {
    await supabase.from('insights').insert({
      org_id: orgId, intent_id: intentId,
      category: 'seo',
      severity: seoSignals.hasMetaDescription ? 'medium' : 'high',
      title: seoSignals.hasMetaDescription ? 'Meta description is too short' : 'Homepage missing a meta description',
      body: seoSignals.hasMetaDescription
        ? `Homepage meta description is ${seoSignals.metaDescriptionLength} characters; aim for 120-160.`
        : 'The homepage has no <meta name="description"> tag, which search engines use for the result snippet.',
      citations: [], model: 'shopify-admin-audit-v1', provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }
  if (!seoSignals.hasStructuredData) {
    await supabase.from('insights').insert({
      org_id: orgId, intent_id: intentId,
      category: 'seo', severity: 'medium',
      title: 'No structured data found on the homepage',
      body: 'No schema.org JSON-LD found. Structured data (Product, Organization, BreadcrumbList) helps search engines show rich results.',
      citations: [], model: 'shopify-admin-audit-v1', provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }
  if (!seoSignals.hasSitemap || !seoSignals.hasRobotsTxt) {
    const missing = [!seoSignals.hasSitemap && 'sitemap.xml', !seoSignals.hasRobotsTxt && 'robots.txt']
      .filter((v): v is string => Boolean(v));
    await supabase.from('insights').insert({
      org_id: orgId, intent_id: intentId,
      category: 'seo', severity: 'high',
      title: `${missing.join(' and ')} not found`,
      body: `${missing.join(' and ')} returned a non-OK response at the store's root. Both should be reachable for search engines to crawl and index the store correctly.`,
      citations: [], model: 'shopify-admin-audit-v1', provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  await supabase.from('intents').update({
    status: 'succeeded',
    updated_at: new Date().toISOString(),
  }).eq('id', intentId);

  await supabase.from('audit_log').insert({
    org_id: orgId, user_id: orgId,
    action: 'analyze.shopify_catalog', outcome: 'success',
    input_hash: await sha256(storeUrl), provider: 'shopify-admin',
    duration_ms: 0, metadata: {},
  });
};

// ── Main handler ────────────────────────────────────────────────────────────

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

  // ── Shopify Admin short-circuit ────────────────────────────────────────
  // When the org has a shopify-admin key, skip Firecrawl + LLM entirely
  // and generate real per-product insights from Shopify/Printify data.
  if (platform === 'shopify') {
    const hasShopifyAdmin = await unwrapProviderKey(supabase, orgId, 'shopify-admin').catch(() => null);
    if (hasShopifyAdmin) {
      try {
        await analyzeShopifyCatalog(supabase, orgId, intentId, url);
        await supabase.rpc('archive_message', {
          p_queue_name: 'q:scrape',
          p_msg_id: (msg as { msg_id: number }).msg_id,
        });
        return new Response('ok', { status: 200 });
      } catch (err) {
        await supabase.from('intents').update({
          status: 'failed',
          error_code: 'SHOPIFY_CATALOG_ANALYZE_FAILED',
          error_message: String(err),
        }).eq('id', intentId);
        return new Response('ok', { status: 200 });
      }
    }
  }

  // ── Fallback: Firecrawl → LLM pipeline ─────────────────────────────────
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