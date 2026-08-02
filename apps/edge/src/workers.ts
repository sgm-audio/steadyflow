/**
 * Proxy + Worker handlers for SteadyFlow.
 *
 * Proxy functions: secure relay that unwraps BYOK keys and calls external APIs.
 * Worker functions: pgmq consumers that drive the analysis pipeline.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@steadyflow/db';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { runCatalogAudit, type FlagCode } from '@steadyflow/shopify-admin';
import { mapShopifyAuditToCatalog } from '@steadyflow/commerce';

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

const MonitorMessage = z.object({
  intentId: z.string(),
  competitorId: z.string(),
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

// ── Key unwrap helper ──────────────────────────────────────────────────────

/** Try to unwrap a provider key. Returns null if key is missing or invalid (graceful fallback). */
const tryUnwrapKey = async (
  supabase: SupabaseClient<Database>,
  provider: string,
  orgId: string,
): Promise<string | null> => {
  try {
    const { data: env, error: envErr } = await supabase
      .from('keys_envelopes')
      .select('wrapped_key')
      .eq('org_id', orgId)
      .eq('provider', provider)
      .single();
    if (envErr) return null;

    const { data: raw, error: unwrapErr } = await supabase.rpc('unwrap_dek', { p_wrapped: env.wrapped_key }).single();
    if (unwrapErr) return null;

    const hex2bytes = (h: string): Uint8Array => new Uint8Array(
      (h.replace(/^\\x/, '').match(/.{1,2}/g) ?? []).map((b) => Number.parseInt(b, 16)),
    );
    const rawBytes = hex2bytes(typeof raw === 'string' ? raw : String(raw));
    const key = new TextDecoder().decode(rawBytes);
    rawBytes.fill(0);
    return key;
  } catch {
    return null;
  }
};

// ── Direct scrape fallback ─────────────────────────────────────────────────

const isPrivateIpv4 = (ip: string): boolean =>
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

const isPrivateIp = (ip: string): boolean => {
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)?.[1];
  return v4Mapped ? isPrivateIpv4(v4Mapped) : false;
};

/**
 * SSRF guard: reject non-http(s) schemes and hosts that resolve to a
 * private/loopback/link-local address (cloud metadata endpoints, internal
 * services) before a scrape is allowed to fetch a user-submitted URL.
 * ponytail: checks resolve-time only, not connect-time, so a DNS-rebind
 * (short-TTL record swapped between this check and fetch()) isn't covered.
 * Upgrade path: pin fetch to the resolved+validated IP via a custom
 * undici Agent if this endpoint becomes a real attacker-reachable target.
 */
const assertPublicHttpUrl = async (rawUrl: string): Promise<void> => {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to scrape non-http(s) URL: ${url.protocol}`);
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error(`Refusing to scrape URL resolving to a private address: ${url.hostname}`);
  }
};

/** Fetch a URL directly and extract readable text content (no Firecrawl key needed). */
const directScrape = async (url: string): Promise<{ markdown: string; metadata: Json }> => {
  await assertPublicHttpUrl(url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' },
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Direct scrape failed ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const html = await res.text();
  // Strip HTML tags, extract text
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const title = titleMatch?.[1]?.trim() ?? url;
  const descMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const description = descMatch?.[1]?.trim() ?? '';
  return {
    markdown: `# ${title}\n\n${description ? `> ${description}\n\n` : ''}${text.slice(0, 40000)}`,
    metadata: { url, title, description, scrapedAt: new Date().toISOString() } as unknown as Json,
  };
};

// ── Proxy: Firecrawl ───────────────────────────────────────────────────────

export const proxyFirecrawl = async (
  supabase: SupabaseClient<Database>,
  orgId: string,
  url: string,
): Promise<{ markdown: string; metadata: Json }> => {
  // Try Firecrawl API first; fall back to direct scrape
  const apiKey = await tryUnwrapKey(supabase, 'firecrawl', orgId);
  if (apiKey) {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: { markdown?: string; metadata?: Json } };
      return {
        markdown: data.data?.markdown ?? '',
        metadata: data.data?.metadata ?? { url, scrapedAt: new Date().toISOString() },
      };
    }
  }
  // Fallback: direct HTTP scrape
  return directScrape(url);
};

// ── Proxy: Tavily ───────────────────────────────────────────────────────────

export const proxyTavily = async (
  supabase: SupabaseClient<Database>,
  orgId: string,
  query: string,
): Promise<Record<string, unknown>> => {
  const apiKey = await tryUnwrapKey(supabase, 'tavily', orgId);
  if (!apiKey) return { skipped: true, reason: 'Tavily key not configured' };
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Tavily API error ${res.status}: ${errBody.slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
};

// ── Proxy: LLM ──────────────────────────────────────────────────────────────

const PROVIDER_ENDPOINTS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/chat/completions',
  'nvidia-nim': 'https://integrate.api.nvidia.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
};

/** Heuristic analysis when no LLM key is available — generates insights directly. */
const heuristicAnalysis = (content: string, url: string): string => {
  const text = content.toLowerCase();
  let storeName = url;
  try { storeName = new URL(url).hostname.replace('www.', ''); } catch { /* keep url */ }
  // Count products mentioned (pricing patterns)
  const priceMatches = text.match(/\$\d+(?:\.\d{2})?/g) ?? [];
  const prices = priceMatches.map((p) => Number(p.replace('$', ''))).filter((n) => n > 0 && n < 10000);
  const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const productCount = (text.match(/(?:add\s+to\s+(?:cart|bag)|buy\s+now|product|item)/g) ?? []).length;
  // SEO check
  const hasTitle = text.length > 0;
  const hasMetaDesc = content.length > 50;
  const hasH1 = ((/<h1[^>]*>/i.exec(content)) ?? []).length > 0;
  // Platform detection
  const isShopify = text.includes('shopify') || text.includes('myshopify') || text.includes('/products/') || text.includes('/collections/');
  const insights = [
    {
      category: 'positioning',
      severity: avgPrice > 100 ? 'high' : 'medium',
      title: `${storeName} — ${isShopify ? 'Shopify' : 'Custom'} Store`,
      body: `Store URL ${url} ${isShopify ? 'appears to be a Shopify store' : 'uses a custom platform'}. Average product price ~$${avgPrice}. Estimated product mentions: ${productCount}.`,
    },
    {
      category: 'seo',
      severity: hasTitle && hasH1 ? 'low' : 'high',
      title: `SEO ${hasTitle && hasH1 ? 'OK' : 'Improvements Needed'}`,
      body: `Page title: ${hasTitle ? 'present' : 'missing'}. H1 tags: ${hasH1 ? 'found' : 'not found'}. Meta description: ${hasMetaDesc ? 'present' : 'short or missing'}.`,
    },
    ...(prices.length > 0 ? [{
      category: 'pricing',
      severity: 'medium',
      title: `Price Range: $${Math.min(...prices)} – $${Math.max(...prices)}`,
      body: `Found ${prices.length} price points across the store. Average price: $${avgPrice}. This suggests a ${avgPrice < 50 ? 'budget' : avgPrice < 200 ? 'mid-range' : 'premium'} positioning strategy.`,
    }] : []),
    {
      category: 'conversion',
      severity: 'medium',
      title: 'Store Readiness Assessment',
      body: `The store has been scraped and analyzed. ${isShopify ? 'Shopify-based store detected — standard e-commerce capabilities expected.' : 'Custom platform detected — verify checkout and cart functionality.'} ${productCount > 0 ? 'Products detected, analysis complete.' : 'Limited product data found on the scraped page.'}`,
    },
  ];
  return JSON.stringify({ insights });
};

export interface LlmResult {
  content: string;
  provider: string;
  model: string;
}

export const proxyLlm = async (
  supabase: SupabaseClient<Database>,
  orgId: string,
  prompt: string,
  model?: string,
): Promise<LlmResult> => {
  // Try LLM API first
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('default_llm_provider, default_llm_base_url, default_llm_model')
    .eq('id', orgId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!orgError && org) {
    const provider = org.default_llm_provider;
    const endpoint = org.default_llm_base_url ?? PROVIDER_ENDPOINTS[provider];
    const defaultModel = model ?? org.default_llm_model;

    if (endpoint) {
      const apiKey = await tryUnwrapKey(supabase, provider, orgId);
      if (apiKey) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: defaultModel,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const result = data.choices?.[0]?.message?.content;
          if (result) return { content: result, provider, model: defaultModel };
        }
      }
    }
  }

  // Fallback: heuristic analysis based on scraped content
  const urlMatch = /https?:\/\/[^\s]+/.exec(prompt);
  const url = urlMatch ? urlMatch[0] : 'unknown';
  const contentMatch = /Content: (.+)$/s.exec(prompt);
  const content = contentMatch?.[1] ?? prompt;
  return { content: heuristicAnalysis(content, url), provider: 'heuristic', model: 'none' };
};

// ── Real Shopify Admin + Printify catalog analysis ─────────────────────────

const FLAG_CATEGORY: Record<FlagCode, string> = {
  low_margin: 'pricing',
  price_spread: 'pricing',
  unlinked_cost: 'pricing',
  missing_alt_text: 'seo',
  short_description: 'seo',
  missing_type_or_tags: 'seo',
  missing_weight: 'inventory',
  orphaned: 'product_mix',
  fx_fallback: 'trend',
};

const FLAG_TITLE: Record<FlagCode, string> = {
  low_margin: 'Products with thin margins',
  missing_alt_text: 'Product images missing alt text',
  short_description: 'Product descriptions are too short',
  missing_type_or_tags: 'Products missing type or tags',
  missing_weight: 'Variants missing weight (blocks international shipping)',
  orphaned: 'Products not in any collection',
  unlinked_cost: 'Products with no matched Printify cost',
  price_spread: 'Wide price spread across variants',
  fx_fallback: 'FX rate fetch failed during this audit',
};

const FLAG_SEVERITY: Record<'red' | 'yellow', 'high' | 'medium'> = {
  red: 'high',
  yellow: 'medium',
};

interface PageSeoSignals {
  hasMetaDescription: boolean;
  metaDescriptionLength: number;
  hasStructuredData: boolean;
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
}

/**
 * Real page-fetch SEO signals the Shopify Admin API doesn't expose (meta
 * description/structured data are theme/SEO-app concerns, not product
 * fields) -- reuses the same SSRF-guarded fetch as directScrape. Best
 * effort: any single check failing (network error, 404) just reads as
 * "missing" rather than aborting the whole analysis.
 */
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
    // Homepage unreachable -- signals stay at their "missing" defaults.
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

/**
 * Real per-product analysis from Shopify Admin + Printify data (margin math,
 * content-quality flags) -- ported from the shopify-printify-audit CLI. No
 * LLM required: this replaces the $NN-regex/h1-exists heuristic entirely for
 * any org with a 'shopify-admin' key configured.
 */
const analyzeShopifyCatalog = async (
  ctx: WorkerCtx,
  intentId: string,
  storeUrl: string,
): Promise<void> => {
  const adminToken = await tryUnwrapKey(ctx.supabase, 'shopify-admin', ctx.orgId);
  if (!adminToken) throw new Error('No shopify-admin key configured');
  const printifyToken = (await tryUnwrapKey(ctx.supabase, 'printify', ctx.orgId)) ?? undefined;

  const audit = await runCatalogAudit({ storeUrl, adminToken, printifyToken });
  // Normalize into the multi-platform commerce catalog shape (Amazon/Alibaba-ready).
  const commerceCatalog = mapShopifyAuditToCatalog(audit);
  const seoSignals = await checkPageSeoSignals(storeUrl);

  // Aggregate by flag code across the whole catalog -- one insight per
  // affected flag, not one row per product per flag.
  const byFlag = new Map<FlagCode, { severity: 'red' | 'yellow'; products: string[] }>();
  for (const row of audit.rows) {
    for (const flag of row.flags) {
      const entry = byFlag.get(flag.code) ?? { severity: flag.severity, products: [] };
      entry.products.push(row.product.title);
      byFlag.set(flag.code, entry);
    }
  }

  for (const [code, { severity, products }] of byFlag) {
    const shown = products.slice(0, 10);
    const remainder = products.length - shown.length;
    const body = `${products.length} product${products.length === 1 ? '' : 's'} affected: ${shown.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}.`;
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: FLAG_CATEGORY[code],
      severity: FLAG_SEVERITY[severity],
      title: FLAG_TITLE[code],
      body: body.slice(0, 5000),
      citations: [],
      model: 'shopify-admin-audit-v1',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  // Page-fetch SEO signals the Admin API doesn't expose.
  if (!seoSignals.hasMetaDescription || seoSignals.metaDescriptionLength < 50) {
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'seo',
      severity: seoSignals.hasMetaDescription ? 'medium' : 'high',
      title: seoSignals.hasMetaDescription ? 'Meta description is too short' : 'Homepage missing a meta description',
      body: seoSignals.hasMetaDescription
        ? `Homepage meta description is ${seoSignals.metaDescriptionLength} characters; aim for 120-160.`
        : 'The homepage has no <meta name="description"> tag, which search engines use for the result snippet.',
      citations: [],
      model: 'shopify-admin-audit-v1',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }
  if (!seoSignals.hasStructuredData) {
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'seo',
      severity: 'medium',
      title: 'No structured data found on the homepage',
      body: 'No schema.org JSON-LD found. Structured data (Product, Organization, BreadcrumbList) helps search engines show rich results.',
      citations: [],
      model: 'shopify-admin-audit-v1',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }
  if (!seoSignals.hasSitemap || !seoSignals.hasRobotsTxt) {
    const missing = [!seoSignals.hasSitemap && 'sitemap.xml', !seoSignals.hasRobotsTxt && 'robots.txt']
      .filter((v): v is string => Boolean(v));
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'seo',
      severity: 'high',
      title: `${missing.join(' and ')} not found`,
      body: `${missing.join(' and ')} returned a non-OK response at the store's root. Both should be reachable for search engines to crawl and index the store correctly.`,
      citations: [],
      model: 'shopify-admin-audit-v1',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  // One catalog-wide pricing summary, if margin data exists for anything.
  const withMargin = audit.rows.filter((r) => r.margin.marginPct !== null);
  if (withMargin.length > 0) {
    const avgMarginPct = withMargin.reduce((sum, r) => sum + (r.margin.marginPct ?? 0), 0) / withMargin.length;
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'pricing',
      severity: avgMarginPct < 35 ? 'high' : 'low',
      title: 'Catalog margin summary',
      body: `Average gross margin across ${withMargin.length} priced product(s): ${avgMarginPct.toFixed(1)}% (${audit.shopCurrency}${audit.fxSource === 'fallback' ? ', FX fallback rate used' : ''}).`,
      citations: [],
      model: 'shopify-admin-audit-v1',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  await ctx.supabase.from('intents').update({
    status: 'succeeded',
    updated_at: new Date().toISOString(),
  }).eq('id', intentId);

  await ctx.supabase.from('audit_log').insert({
    org_id: ctx.orgId, user_id: ctx.orgId,
    action: 'analyze.shopify_catalog', outcome: 'success',
    input_hash: await sha256(storeUrl), provider: 'shopify-admin',
    duration_ms: 0,
    metadata: {
      totalProducts: audit.totalProducts,
      totalCollections: audit.totalCollections,
      commercePlatform: commerceCatalog.platform,
      commerceProductCount: commerceCatalog.totalProducts,
    },
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

  // Real Shopify Admin + Printify data supersedes generic scraping entirely
  // when the org has connected a shopify-admin key -- no scrape, no LLM
  // needed for real per-product margin/SEO signals.
  if (platform === 'shopify') {
    const hasShopifyAdmin = await tryUnwrapKey(ctx.supabase, 'shopify-admin', ctx.orgId);
    if (hasShopifyAdmin) {
      try {
        await analyzeShopifyCatalog(ctx, intentId, url);
        await ctx.supabase.rpc('archive_message', {
          p_queue_name: 'q:scrape',
          p_msg_id: envelope.data.msg_id,
        });
      } catch (err) {
        await ctx.supabase.from('intents').update({
          status: 'failed',
          error_code: 'SHOPIFY_CATALOG_ANALYZE_FAILED',
          error_message: String(err),
          updated_at: new Date().toISOString(),
        }).eq('id', intentId);
      }
      return;
    }
  }

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

  // Enrich worker: archived (Hunter.io removed, Tavily handled separately)
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

    const prompt = `Analyze this Shopify store page content from ${source.url}\n\nReturn JSON with insights array.\n\nContent: ${source.raw_markdown?.slice(0, 8000) ?? '(empty)'}`;
    const llmResult = await proxyLlm(ctx.supabase, ctx.orgId, prompt);

    let insights: unknown[] = [];
    try {
      const parsedResponse: unknown = JSON.parse(llmResult.content);
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
        model: llmResult.model,
        provider: llmResult.provider,
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
      input_hash: '0'.repeat(64), provider: llmResult.provider,
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

// ── Worker: Monitor Competitor ───────────────────────────────────────────────

const PRICE_REGEX = /\$\d{1,4}(?:\.\d{2})?/g;

const extractPrices = (text: string): number[] =>
  (text.match(PRICE_REGEX) ?? [])
    .map((p) => Number(p.replace('$', '')))
    .filter((n) => n > 0 && n < 10000);

const asNumberArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : [];

/**
 * Diffs a competitor's tracked price points against Madi's own store,
 * implementing the previously-defined-but-unimplemented
 * intents.kind = 'monitor_competitor'. Prefers Tavily search (already
 * BYOK-integrated) for price discovery over maintaining brittle
 * per-competitor scrapers; falls back to the existing SSRF-guarded
 * directScrape of the competitor's own URL when Tavily finds nothing.
 */
export const workerMonitorCompetitor = async (ctx: WorkerCtx): Promise<void> => {
  const { data: msg, error: deqError } = await ctx.supabase.rpc('dequeue_message', {
    p_queue_name: 'q:monitor',
  });
  if (deqError || !msg) return;

  const envelope = QueueEnvelope.safeParse(msg);
  if (!envelope.success) return;
  const payload = MonitorMessage.safeParse(envelope.data.message);
  if (!payload.success) return;

  const { intentId, competitorId } = payload.data;

  await ctx.supabase.from('intents').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', intentId);

  try {
    const { data: competitor, error: compError } = await ctx.supabase
      .from('competitors')
      .select('id, name, url, niche_notes')
      .eq('id', competitorId)
      .single();
    if (compError) throw new Error('Competitor not found');

    // Previous snapshot, fetched before we write a new one, for the diff below.
    const { data: previous } = await ctx.supabase
      .from('competitor_snapshots')
      .select('price_points, captured_at')
      .eq('competitor_id', competitorId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let prices: number[] = [];
    let source: 'tavily' | 'scrape' = 'tavily';

    const searchQuery = competitor.niche_notes
      ? `${competitor.name} ${competitor.niche_notes} price`
      : `${competitor.name} price`;
    const tavilyResult = await proxyTavily(ctx.supabase, ctx.orgId, searchQuery);
    if (!('skipped' in tavilyResult) && Array.isArray(tavilyResult.results)) {
      for (const r of tavilyResult.results as unknown[]) {
        const content = (r as { content?: unknown }).content;
        if (typeof content === 'string') prices.push(...extractPrices(content));
      }
    }

    if (prices.length === 0) {
      // Fall back to directly scraping the competitor's own storefront.
      source = 'scrape';
      const scraped = await directScrape(competitor.url);
      prices = extractPrices(scraped.markdown);
    }

    const { data: snapshot } = await ctx.supabase.from('competitor_snapshots').insert({
      org_id: ctx.orgId,
      competitor_id: competitorId,
      product_count: prices.length || null,
      price_points: prices,
      source,
    }).select('id').single();

    // Diff against the previous snapshot, if one exists and both have data.
    const prevPrices = asNumberArray(previous?.price_points);
    if (previous && prevPrices.length > 0 && prices.length > 0) {
      const prevAvg = prevPrices.reduce((a, b) => a + b, 0) / prevPrices.length;
      const currAvg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const deltaPct = prevAvg > 0 ? ((currAvg - prevAvg) / prevAvg) * 100 : 0;

      if (Math.abs(deltaPct) >= 5) {
        await ctx.supabase.from('insights').insert({
          org_id: ctx.orgId,
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

    await ctx.supabase.from('intents').update({
      status: 'succeeded',
      updated_at: new Date().toISOString(),
    }).eq('id', intentId);

    await ctx.supabase.from('audit_log').insert({
      org_id: ctx.orgId, user_id: ctx.orgId,
      action: 'monitor.competitor', outcome: 'success',
      input_hash: await sha256(competitor.url), provider: source,
      duration_ms: 0,
      metadata: { competitorId, priceCount: prices.length, snapshotId: snapshot?.id ?? null },
    });

    await ctx.supabase.rpc('archive_message', {
      p_queue_name: 'q:monitor',
      p_msg_id: envelope.data.msg_id,
    });
  } catch (err) {
    await ctx.supabase.from('intents').update({
      status: 'failed',
      error_code: 'MONITOR_FAILED',
      error_message: String(err),
      updated_at: new Date().toISOString(),
    }).eq('id', intentId);
  }
};
