/**
 * Proxy + Worker handlers for SteadyFlow.
 *
 * Proxy functions: secure relay that unwraps BYOK keys and calls external APIs.
 * Worker functions: pgmq consumers that drive the analysis pipeline.
 */

import type { Database, Json } from '@steadyflow/db';
import {
  aggregateFlags,
  analyzeStorefrontHtml,
  buildLeakList,
  buildProductFinding,
  computeAuditScore,
  crawlSitemapUrls,
  extractAppFingerprints,
  fetchPerformanceSignals,
  FLAG_CATEGORY,
  FLAG_SEVERITY,
  FLAG_TITLE,
  lintThemeHtml,
  runCatalogAudit,
  scoreRubric,
  totalEstimatedImpact,
  verifyTracking,
} from '@steadyflow/shopify-admin';
import type { FlagCode } from '@steadyflow/shopify-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import {
  buildFirstSalePlaybook,
  computeAiReadiness,
  computeFirstSaleMath,
  type PageSeoSignals,
} from './analysis/playbook.js';

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

/**
 * audit_log.user_id has a foreign key to auth.users — WorkerCtx only carries
 * orgId (these are background pgmq consumers, not user-scoped requests), so
 * writing ctx.orgId as user_id always violated the FK and silently dropped
 * the audit row. Intents already record the user who created them; look
 * that up instead of guessing.
 */
const resolveIntentUserId = async (
  supabase: SupabaseClient<Database>,
  intentId: string,
  fallback: string,
): Promise<string> => {
  const { data } = await supabase.from('intents').select('user_id').eq('id', intentId).single();
  return data?.user_id ?? fallback;
};

// Matches the generated `Json` type — lets Zod prove a value is safe to
// write into a jsonb column instead of `as Json` casting past the compiler.
const JsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValue),
    z.record(z.string(), JsonValue),
  ]),
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

    const { data: raw, error: unwrapErr } = await supabase
      .rpc('unwrap_dek', { p_wrapped: env.wrapped_key })
      .single();
    if (unwrapErr) return null;

    const hex2bytes = (h: string): Uint8Array =>
      new Uint8Array(
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
  try {
    storeName = new URL(url).hostname.replace('www.', '');
  } catch {
    /* keep url */
  }
  // Count products mentioned (pricing patterns)
  const priceMatches = text.match(/\$\d+(?:\.\d{2})?/g) ?? [];
  const prices = priceMatches
    .map((p) => Number(p.replace('$', '')))
    .filter((n) => n > 0 && n < 10000);
  const avgPrice =
    prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const productCount = (text.match(/(?:add\s+to\s+(?:cart|bag)|buy\s+now|product|item)/g) ?? [])
    .length;
  // SEO check
  const hasTitle = text.length > 0;
  const hasMetaDesc = content.length > 50;
  const hasH1 = (/<h1[^>]*>/i.exec(content) ?? []).length > 0;
  // Platform detection
  const isShopify =
    text.includes('shopify') ||
    text.includes('myshopify') ||
    text.includes('/products/') ||
    text.includes('/collections/');
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
    ...(prices.length > 0
      ? [
          {
            category: 'pricing',
            severity: 'medium',
            title: `Price Range: $${Math.min(...prices)} – $${Math.max(...prices)}`,
            body: `Found ${prices.length} price points across the store. Average price: $${avgPrice}. This suggests a ${avgPrice < 50 ? 'budget' : avgPrice < 200 ? 'mid-range' : 'premium'} positioning strategy.`,
          },
        ]
      : []),
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
  let hasProductSchema = false;
  let hasGtin = false;
  let allowsOaiSearchBot = false;
  let allowsPerplexityBot = false;
  let robotsText = '';
  try {
    await assertPublicHttpUrl(base);
    const res = await fetch(base, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' },
    });
    if (res.ok) {
      const html = await res.text();
      const descMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(
        html,
      );
      metaDescriptionLength = descMatch?.[1]?.trim().length ?? 0;
      hasMetaDescription = metaDescriptionLength > 0;
      hasStructuredData = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);

      const ldJsonMatches =
        html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ??
        [];
      for (const match of ldJsonMatches) {
        try {
          const jsonStr = match.replace(/<[^>]+>/g, '').trim();
          const ld = JSON.parse(jsonStr) as Record<string, unknown>;
          if (Array.isArray(ld['@graph'])) {
            for (const item of ld['@graph'] as Record<string, unknown>[]) {
              if (item['@type'] === 'Product') {
                hasProductSchema = true;
                if (item.gtin || item.sku || item.mpn) hasGtin = true;
              }
            }
          }
          if (ld['@type'] === 'Product') {
            hasProductSchema = true;
            if (ld.gtin || ld.sku || ld.mpn) hasGtin = true;
          }
        } catch {
          /* malformed JSON-LD */
        }
      }
    }
  } catch {
    // Homepage unreachable -- signals stay at their "missing" defaults.
  }

  // Fetch robots.txt for AI crawler bot directives
  try {
    const robotsUrl = `${base}/robots.txt`;
    await assertPublicHttpUrl(robotsUrl);
    const robotsRes = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' },
    });
    if (robotsRes.ok) {
      robotsText = await robotsRes.text();
      allowsOaiSearchBot =
        robotsText.includes('OAI-SearchBot') &&
        !robotsText.includes('Disallow: /\nUser-agent: OAI-SearchBot');
      allowsOaiSearchBot =
        /User-agent:\s*OAI-SearchBot/i.test(robotsText) &&
        !/User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/.test(robotsText) &&
        !/User-agent:\s*OAI-SearchBot[\s\S]*Disallow:\s*\//im.test(robotsText);
      allowsPerplexityBot =
        /User-agent:\s*PerplexityBot/i.test(robotsText) &&
        !/User-agent:\s*PerplexityBot[\s\S]*Disallow:\s*\//im.test(robotsText);
    }
  } catch {
    /* robots.txt unreachable */
  }

  const checkExists = async (path: string): Promise<boolean> => {
    try {
      const url = `${base}${path}`;
      await assertPublicHttpUrl(url);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' },
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const [hasSitemap, hasRobotsTxt] = await Promise.all([
    checkExists('/sitemap.xml'),
    checkExists('/robots.txt'),
  ]);

  return {
    hasMetaDescription,
    metaDescriptionLength,
    hasStructuredData,
    hasSitemap,
    hasRobotsTxt,
    allowsOaiSearchBot,
    allowsPerplexityBot,
    hasProductSchema,
    hasGtin,
  };
};

/**
 * Static storefront speed / friction / app-bloat analysis. Fetches the
 * homepage (SSRF-guarded) and runs the deterministic HTML analyzer. Best
 * effort: any failure reads as "no data" rather than aborting the audit.
 */
const checkStorefrontSignals = async (
  storeUrl: string,
): Promise<{ analysis: ReturnType<typeof analyzeStorefrontHtml>; html: string } | null> => {
  const base = storeUrl.replace(/\/+$/, '');
  try {
    await assertPublicHttpUrl(base);
    const res = await fetch(base, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return { analysis: analyzeStorefrontHtml(html, new URL(base).hostname), html };
  } catch {
    return null;
  }
};

/**
 * v2 catalog analysis — paginated, per-product findings persisted,
 * LLM synthesis for narrative + missing categories, audit score,
 * store profiles for dedup.
 */
const analyzeShopifyCatalog = async (
  ctx: WorkerCtx,
  intentId: string,
  storeUrl: string,
): Promise<void> => {
  const userId = await resolveIntentUserId(ctx.supabase, intentId, ctx.orgId);
  const shopifyKey = await tryUnwrapKey(ctx.supabase, 'shopify-admin', ctx.orgId);
  if (!shopifyKey) throw new Error('No shopify-admin key configured');
  const printifyToken = (await tryUnwrapKey(ctx.supabase, 'printify', ctx.orgId)) ?? undefined;

  // The shopify-admin key is either a legacy static token, or a JSON object
  // {clientId, clientSecret, shop?} for the 2026 client-credentials grant.
  let adminToken: string | undefined;
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  let shopDomain: string | undefined;
  try {
    const parsed = JSON.parse(shopifyKey) as {
      clientId?: unknown;
      clientSecret?: unknown;
      shop?: unknown;
    };
    if (typeof parsed.clientId === 'string' && typeof parsed.clientSecret === 'string') {
      clientId = parsed.clientId;
      clientSecret = parsed.clientSecret;
      if (typeof parsed.shop === 'string') shopDomain = parsed.shop;
    } else {
      adminToken = shopifyKey;
    }
  } catch {
    adminToken = shopifyKey;
  }

  const audit = await runCatalogAudit({
    storeUrl,
    adminToken,
    clientId,
    clientSecret,
    shopDomain,
    printifyToken,
  });
  const seoSignals = await checkPageSeoSignals(storeUrl);
  const score = computeAuditScore(audit.rows);
  // Matches intents.input_hash (SHA-256 of JSON {platform,url}) set by the
  // intel-analyze-shop edge function, so dedup links prior runs of the store.
  const urlHash = await sha256(JSON.stringify({ platform: 'shopify', url: storeUrl }));

  // ── Persist score snapshot for S6 (recurring-audit diff) ──
  // Best-effort: re-running the same intent updates the row by intent_id.
  {
    const rubric = scoreRubric(
      aggregateFlags(
        audit.rows.map((r) => ({ flags: r.flags })),
        audit.catalogFlags,
      ),
      audit.rows.length,
    );
    const categoryScores: Record<string, { score: number; max: number }> = {};
    for (const c of rubric.categoryScores) {
      categoryScores[c.id] = { score: c.score, max: c.maxPoints };
    }
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const row of audit.rows) {
      for (const f of row.flags) {
        if (f.severity === 'red') severityCounts.high++;
        else severityCounts.medium++;
      }
    }
    if (rubric.criticalCapped) severityCounts.critical = 1;
    try {
      await ctx.supabase.from('score_history').upsert(
        {
          org_id: ctx.orgId,
          intent_id: intentId,
          shop_domain: shopDomain ?? new URL(storeUrl).host,
          total_score: Math.round(rubric.totalScore),
          grade: rubric.grade,
          category_scores: categoryScores,
          critical_count: severityCounts.critical,
          high_count: severityCounts.high,
          medium_count: severityCounts.medium,
          low_count: severityCounts.low,
          finding_count: audit.rows.length,
          rubric_version: 'v1',
        },
        { onConflict: 'intent_id' },
      );
    } catch {
      // best-effort; S6 score_history failures must not fail an audit
    }
  }

  // ── Supersede prior analyses of the same store ──
  await ctx.supabase.rpc('supersede_store_insights', {
    p_org_id: ctx.orgId,
    p_input_hash: urlHash,
    p_exclude_intent: intentId,
  });

  // ── Upsert store profile ──
  await ctx.supabase.from('store_profiles').upsert(
    {
      org_id: ctx.orgId,
      url: storeUrl,
      url_hash: urlHash,
      store_name: audit.shop.name,
      currency: audit.shopCurrency,
      product_count: audit.totalProducts,
      collection_count: audit.totalCollections,
      latest_intent_id: intentId,
      latest_score: score,
      last_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id, url_hash' },
  );

  // ── Persist per-product findings ──
  for (const row of audit.rows) {
    const pf = buildProductFinding(row);
    await ctx.supabase.from('product_findings').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      ...pf,
      flags: pf.flags as unknown as Json,
    });
  }

  // ── Aggregate deterministic insights by flag code ──
  const byFlag = new Map<FlagCode, { severity: 'red' | 'yellow'; products: string[] }>();
  for (const row of audit.rows) {
    for (const flag of row.flags) {
      const entry = byFlag.get(flag.code) ?? { severity: flag.severity, products: [] };
      entry.products.push(row.product.title);
      byFlag.set(flag.code, entry);
    }
  }

  // Track inserted insights to prevent duplicates within this run
  const insertedBodies = new Set<string>();

  // ── Revenue impact (ranked Leak List) ──
  const leakList = buildLeakList(
    audit.rows.map((r) => ({ priceMinCAD: r.margin.priceMinCAD, flags: r.flags })),
    audit.shopCurrency,
    {
      ...(audit.salesSummary ? { sales: audit.salesSummary } : {}),
      catalogFlags: audit.catalogFlags,
    },
  );
  const leakImpactByCode = new Map(leakList.map((l) => [l.code, l.estimatedAnnualImpact]));
  const leakTotal = totalEstimatedImpact(leakList);

  for (const [code, { severity, products }] of byFlag) {
    // Deduplicate: skip if this out-of-stock body was already inserted
    const bodyKey = `${products.length} product${products.length === 1 ? '' : 's'} out of stock`;
    if (insertedBodies.has(bodyKey)) continue;
    insertedBodies.add(bodyKey);

    const shown = products.slice(0, 3);
    const remainder = products.length - shown.length;
    const impact = leakImpactByCode.get(code);
    const impactSuffix =
      impact !== undefined && impact > 0 ? ` ~$${impact.toLocaleString()}/yr` : '';
    const body = `${products.length} product${products.length === 1 ? '' : 's'} out of stock${remainder > 0 ? ` (${shown.join(', ')} + ${remainder} more)` : ''}${impactSuffix}`;
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: FLAG_CATEGORY[code],
      severity: FLAG_SEVERITY[severity],
      title: FLAG_TITLE[code],
      body: body.slice(0, 3000),
      citations: [],
      model: 'shopify-admin-audit-v2',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  // ── Catalog-level flags (mix / assortment) — one insight per flag ──
  for (const flag of audit.catalogFlags) {
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: FLAG_CATEGORY[flag.code],
      severity: FLAG_SEVERITY[flag.severity],
      title: FLAG_TITLE[flag.code],
      body: flag.message.slice(0, 5000),
      citations: [],
      model: 'shopify-admin-audit-v2',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  // ── Ranked Leak List summary ──
  if (leakList.length > 0) {
    const top = leakList
      .slice(0, 5)
      .map((l, i) => `${i + 1}. ${l.title} — ~$${l.estimatedAnnualImpact.toLocaleString()}/yr`)
      .join('\n');
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'pricing',
      severity: leakTotal >= 10000 ? 'high' : 'medium',
      title: `Revenue Leak List — ~$${leakTotal.toLocaleString()}/yr recoverable (estimated)`,
      body: `Ranked by estimated annual recoverable revenue:\n${top}${leakList.length > 5 ? `\n+ ${leakList.length - 5} more` : ''}\n\nEstimates use ${audit.shopCurrency} prices/margins${audit.salesSummary ? ' and real order data (AOV + order volume)' : ' and documented assumptions (read_orders not granted)'}.`,
      citations: [],
      model: 'shopify-admin-audit-v2',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  // ── Homepage SEO signals ──
  if (!seoSignals.hasMetaDescription || seoSignals.metaDescriptionLength < 50) {
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'seo',
      severity: seoSignals.hasMetaDescription ? 'medium' : 'high',
      title: seoSignals.hasMetaDescription
        ? 'Meta description is too short'
        : 'Homepage missing a meta description',
      body: seoSignals.hasMetaDescription
        ? `Homepage meta description is ${seoSignals.metaDescriptionLength} characters; aim for 120-160.`
        : 'The homepage has no <meta name="description"> tag.',
      citations: [],
      model: 'shopify-admin-audit-v2',
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
      title: 'No structured data on homepage',
      body: 'No schema.org JSON-LD found. Structured data helps search engines show rich results.',
      citations: [],
      model: 'shopify-admin-audit-v2',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }
  if (!seoSignals.hasSitemap || !seoSignals.hasRobotsTxt) {
    const missing = [
      !seoSignals.hasSitemap && 'sitemap.xml',
      !seoSignals.hasRobotsTxt && 'robots.txt',
    ].filter((v): v is string => Boolean(v));
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'seo',
      severity: 'high',
      title: `${missing.join(' and ')} not found`,
      body: `${missing.join(' and ')} returned a non-OK response. Both should be reachable for search engines.`,
      citations: [],
      model: 'shopify-admin-audit-v2',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  // ── Speed / friction + app bloat (static storefront analysis) ──
  const storefrontFetch = await checkStorefrontSignals(storeUrl);
  const storefront = storefrontFetch?.analysis ?? null;
  if (storefrontFetch && storefront) {
    if (storefront.appHosts.length > 0) {
      const apps = storefront.appHosts.map((h) => h.appName ?? h.host).join(', ');
      await ctx.supabase.from('insights').insert({
        org_id: ctx.orgId,
        intent_id: intentId,
        category: 'conversion',
        severity: storefront.appHosts.length >= 3 ? 'high' : 'medium',
        title: `App bloat: ${storefront.appHosts.length} third-party app${storefront.appHosts.length === 1 ? '' : 's'} loading scripts`,
        body: `Detected: ${apps}. Each app adds load time and a potential subscription overlap. Review which are still used — removing dead apps cuts page weight and cost.`,
        citations: [],
        model: 'shopify-admin-audit-v2',
        provider: 'shopify-admin',
        generated_at: new Date().toISOString(),
      });
    }
    if (
      storefront.renderBlockingScripts > 0 ||
      storefront.thirdPartyHosts.length > 0 ||
      storefront.imagesWithoutDimensions > 0
    ) {
      const parts: string[] = [];
      if (storefront.renderBlockingScripts > 0)
        parts.push(`${storefront.renderBlockingScripts} render-blocking script(s)`);
      if (storefront.thirdPartyHosts.length > 0)
        parts.push(
          `${storefront.thirdPartyHosts.length} third-party host(s) (${storefront.thirdPartyHosts.map((h) => h.host).join(', ')})`,
        );
      if (storefront.imagesWithoutDimensions > 0)
        parts.push(
          `${storefront.imagesWithoutDimensions}/${storefront.totalImages} image(s) without width/height`,
        );
      await ctx.supabase.from('insights').insert({
        org_id: ctx.orgId,
        intent_id: intentId,
        category: 'conversion',
        severity: storefront.renderBlockingRisk === 'high' ? 'high' : 'medium',
        title: `Speed & friction: ${storefront.inefficiencyScore}/100 friction score`,
        body: `${parts.join('; ')}. Render-blocking risk: ${storefront.renderBlockingRisk}, layout-shift risk: ${storefront.layoutShiftRisk}. These are static proxies for Core Web Vitals — render-blocking JS and undimensioned images are the most common causes of slow LCP and layout shift.`,
        citations: [],
        model: 'shopify-admin-audit-v2',
        provider: 'shopify-admin',
        generated_at: new Date().toISOString(),
      });
    }

    // ── B2 — theme lint from rendered homepage HTML ──
    const themeLint = lintThemeHtml(storefrontFetch.html);
    if (themeLint.issueCount > 0) {
      const top = themeLint.issues
        .slice(0, 6)
        .map((i: { code: string; message: string }) => `${i.code}: ${i.message}`)
        .join(' ');
      await ctx.supabase.from('insights').insert({
        org_id: ctx.orgId,
        intent_id: intentId,
        category: 'seo',
        severity: themeLint.highCount > 0 ? 'high' : 'medium',
        title: `Theme lint: ${themeLint.issueCount} issue${themeLint.issueCount === 1 ? '' : 's'} on homepage HTML`,
        body: `${top} Static HTML proxy for theme-check (no Liquid source).`,
        citations: [],
        model: 'theme-lint-v1',
        provider: 'shopify-admin',
        generated_at: new Date().toISOString(),
      });
    }
  }

  // ── B3 — persist app fingerprints to the dedup table ──
  // Upsert so re-running the same audit updates seen_count + last_seen_at
  // instead of duplicating. `unique(shop_domain, app_handle, detection_source)`
  // makes the upsert idempotent at the DB level.
  if (storefront) {
    const fingerprints = extractAppFingerprints(storefront, shopDomain ?? new URL(storeUrl).host);
    for (const fp of fingerprints) {
      try {
        await ctx.supabase.rpc('upsert_app_fingerprint', {
          p_org_id: ctx.orgId,
          p_shop_domain: fp.shop_domain,
          p_app_handle: fp.app_handle,
          p_app_title: fp.app_title,
          p_detection_source: fp.detection_source,
          p_category: fp.category,
        });
      } catch {
        // best-effort; never fail an audit because fingerprint write failed
      }
    }
  }

  // ── P2 sitemap-aware crawl — extends B3 with product/collection pages ──
  // Caps: 20 URLs, 5s timeout each, skips robots-disallowed, fail-closed.
  // Re-runs extractAppFingerprints on each crawled HTML and upserts via the
  // same dedup RPC (seen_count accumulates). Best-effort, never fails audit.
  try {
    const base = storeUrl.replace(/\/+$/, '');
    const sitemapGuard = `${base}/sitemap.xml`;
    try {
      await assertPublicHttpUrl(sitemapGuard);
    } catch {
      throw new Error('sitemap SSRF blocked');
    }
    const sitemapTargets = await crawlSitemapUrls(storeUrl, { timeoutMs: 5_000 });
    const withTimeoutFetch = (ms: number): typeof fetch =>
      ((input: string | URL, init?: RequestInit) =>
        Promise.race([
          fetch(input as unknown as string, init),
          new Promise<Response>((_, reject) =>
            setTimeout(() => {
              reject(new Error(`Fetch timed out after ${ms}ms`));
            }, ms),
          ),
        ])) as typeof fetch;
    const f = withTimeoutFetch(5_000);
    const crawledApps = new Map<string, ReturnType<typeof extractAppFingerprints>[number]>();
    // Seed with homepage fingerprints so dedup is cross-page
    if (storefront) {
      for (const fp of extractAppFingerprints(storefront, shopDomain ?? new URL(storeUrl).host)) {
        crawledApps.set(fp.app_handle, fp);
      }
    }
    for (const pageUrl of sitemapTargets) {
      try {
        await assertPublicHttpUrl(pageUrl);
        const res = await f(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' },
        });
        if (!res.ok) continue;
        const html = await res.text();
        if (html.length > 500_000) continue;
        const analysis = analyzeStorefrontHtml(html, new URL(pageUrl).hostname);
        for (const fp of extractAppFingerprints(analysis, shopDomain ?? new URL(storeUrl).host)) {
          const prev = crawledApps.get(fp.app_handle);
          if (prev) {
            prev.host_count = Math.max(prev.host_count, fp.host_count);
            prev.script_count += fp.script_count;
          } else {
            crawledApps.set(fp.app_handle, { ...fp });
          }
        }
      } catch {
        continue;
      }
    }
    // Only upsert apps that weren't already persisted from the homepage pass
    // (homepage apps already upserted above; re-upserting is harmless due to dedup,
    // but we avoid duplicate RPCs by checking).
    const homepageHandles = new Set(
      storefront
        ? extractAppFingerprints(storefront, shopDomain ?? new URL(storeUrl).host).map(
            (fp) => fp.app_handle,
          )
        : [],
    );
    for (const fp of crawledApps.values()) {
      if (homepageHandles.has(fp.app_handle)) continue;
      try {
        await ctx.supabase.rpc('upsert_app_fingerprint', {
          p_org_id: ctx.orgId,
          p_shop_domain: fp.shop_domain,
          p_app_handle: fp.app_handle,
          p_app_title: fp.app_title,
          p_detection_source: fp.detection_source,
          p_category: fp.category,
        });
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort; sitemap failures never block audit
  }

  // ── B7 — fetch PSI / CrUX performance signals (lab + field) ──
  // Best-effort, parallel with no blocking; failure falls through to the
  // static storefront proxy insights above.
  try {
    const signals = await fetchPerformanceSignals(storeUrl, { timeoutMs: 10_000 });
    const cwvFailures: string[] = [];
    for (const sig of signals.signals) {
      if (!sig.available) continue;
      if (
        sig.largestContentfulPaint &&
        sig.largestContentfulPaint.p50 >= (sig.largestContentfulPaint.poor ?? 4000)
      ) {
        cwvFailures.push(`LCP ${Math.round(sig.largestContentfulPaint.p50)}ms (${sig.source})`);
      }
      if (sig.cumulativeLayoutShift && sig.cumulativeLayoutShift.score < 0.9) {
        cwvFailures.push(`CLS ${sig.cumulativeLayoutShift.score.toFixed(2)} (${sig.source})`);
      }
    }
    if (cwvFailures.length > 0) {
      await ctx.supabase.from('insights').insert({
        org_id: ctx.orgId,
        intent_id: intentId,
        category: 'conversion',
        severity: 'high',
        title: `Core Web Vitals failing in ${cwvFailures.length} measurement${cwvFailures.length === 1 ? '' : 's'}`,
        body: `${cwvFailures.join('; ')}. Sourced from Google PageSpeed Insights (lab) and Chrome User Experience Report (field). The static HTML proxy above flags render-blocking JS and undimensioned images — these are the typical causes.`,
        citations: [],
        model: 'psi-crux-v1',
        provider: 'google-pagespeed',
        generated_at: new Date().toISOString(),
      });
    }
  } catch {
    // best-effort
  }

  // ── B6 — tracking verification from homepage HTML ──
  // Best-effort detector on the already-fetched storefrontFetch.html;
  // never fails the audit. Writes one insight when coverage is incomplete.
  try {
    if (storefrontFetch?.html) {
      const tracking = verifyTracking(storeUrl, storefrontFetch.html);
      if (tracking.coverageScore < 80) {
        const missing = tracking.checks
          .filter((c: { detected: boolean }) => !c.detected)
          .map((c: { provider: string }) => c.provider)
          .join(', ');
        await ctx.supabase.from('insights').insert({
          org_id: ctx.orgId,
          intent_id: intentId,
          category: 'analytics',
          severity: tracking.coverageScore < 40 ? 'high' : 'medium',
          title: `Tracking coverage ${tracking.coverageScore}/100 — ${tracking.checks.filter((c: { detected: boolean }) => c.detected).length}/10 providers firing`,
          body: `Missing: ${missing || 'none'}. Coverage uses weights ga4(25) meta(20) ads(15) shopify(15) gtm(10) klaviyo(5) tiktok(5) pinterest(3) snap(1) segment(1). Recommendations: ${tracking.recommendations
            .slice(0, 3)
            .map((r: { message: string }) => r.message)
            .join(' ')}`,
          citations: [],
          model: 'tracking-verify-v1',
          provider: 'storefront-html',
          generated_at: new Date().toISOString(),
        });
      }
    }
  } catch {
    // best-effort
  }

  // ── Catalog-wide summaries ──
  const withMargin = audit.rows.filter((r) => r.margin.marginPct !== null);
  if (withMargin.length > 0) {
    const avgMarginPct =
      withMargin.reduce((sum, r) => sum + (r.margin.marginPct ?? 0), 0) / withMargin.length;
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'pricing',
      severity: avgMarginPct < 35 ? 'high' : 'low',
      title: 'Catalog margin summary',
      body: `Average gross margin: ${avgMarginPct.toFixed(1)}% across ${withMargin.length} priced product(s) (${audit.shopCurrency}${audit.fxSource === 'fallback' ? ', FX fallback' : ''}).`,
      citations: [],
      model: 'shopify-admin-audit-v2',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  const outOfStock = audit.rows.filter((r) => {
    const variants = r.product.variants.edges.map((e) => e.node);
    return variants.length > 0 && variants.every((v) => v.availableForSale === false);
  });
  if (outOfStock.length > 0) {
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'inventory',
      severity: outOfStock.length > 3 ? 'high' : 'medium',
      title: 'Out-of-stock products',
      body: `${outOfStock.length} product(s) currently out of stock: ${outOfStock
        .map((r) => r.product.title)
        .slice(0, 8)
        .join(', ')}.`,
      citations: [],
      model: 'shopify-admin-audit-v2',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  // ── AI Agent Readiness Score ──
  const aiReadiness = computeAiReadiness(seoSignals, audit);
  await ctx.supabase.from('insights').insert({
    org_id: ctx.orgId,
    intent_id: intentId,
    category: 'ai_agent_readiness',
    severity: aiReadiness.score < 40 ? 'high' : aiReadiness.score < 70 ? 'medium' : 'low',
    title: `AI Shopping Agent Readiness Score: ${aiReadiness.score}/100`,
    body: `Store is ${aiReadiness.score >= 70 ? 'well-prepared' : aiReadiness.score >= 40 ? 'partially ready' : 'not ready'} for AI shopping agents (ChatGPT Shopping, Google AI Mode, Perplexity). Product schema: ${aiReadiness.productSchemaPresent ? 'present' : 'MISSING'}. GTINs: ${aiReadiness.gtinOnProducts ? 'present' : 'MISSING'}. OAI-SearchBot allowed: ${aiReadiness.chatgptShopping ? 'yes' : 'no'}. ChatGPT Shopping is free for Shopify stores via Shop Pay integration — your products may already appear if you have Shop Pay enabled. Google AI Mode (0% fees) requires a Google Merchant Center feed. Perplexity merchant program is free via crawl. Action: submit GMC feed, add Product JSON-LD schema with GTINs, and allow AI crawlers in robots.txt.`,
    citations: [],
    model: 'shopify-admin-audit-v2',
    provider: 'shopify-admin',
    generated_at: new Date().toISOString(),
  });

  // ── First Sale Math ──
  const firstSaleMath = computeFirstSaleMath(audit);
  if (firstSaleMath) {
    await ctx.supabase.from('insights').insert({
      org_id: ctx.orgId,
      intent_id: intentId,
      category: 'first_sale_math',
      severity:
        firstSaleMath.breakEvenRoas > 3.5
          ? 'high'
          : firstSaleMath.breakEvenRoas > 2.0
            ? 'medium'
            : 'low',
      title: `Break-even ROAS: ${firstSaleMath.breakEvenRoas.toFixed(1)}x at ${firstSaleMath.grossMarginPct.toFixed(0)}% margin`,
      body: `Gross margin: ${firstSaleMath.grossMarginPct.toFixed(0)}% (Printify cost + payment fees). Break-even ROAS: ${firstSaleMath.breakEvenRoas.toFixed(1)}×. Recommended first channel: ${firstSaleMath.recommendedChannel} at ~$${firstSaleMath.recommendedCpc.toFixed(2)} CPC. At 2% conversion: need ${firstSaleMath.clicksForFirstSale} clicks → ~$${firstSaleMath.estimatedFirstSaleCost} estimated first-sale cost. Meta/TikTok have the lowest CPCs for apparel ($0.45-0.50); avoid Google Shopping ($4.44 CPC) unless margin exceeds 75%. Budget recommendation: $${firstSaleMath.dailyBudget}/day on ${firstSaleMath.recommendedChannel}. With POD margins (20-40% typical per Printful), every dollar of ad spend must return $2.5-5× in revenue to break even.`,
      citations: [],
      model: 'shopify-admin-audit-v2',
      provider: 'shopify-admin',
      generated_at: new Date().toISOString(),
    });
  }

  // ── Channel Gap Audit ──
  await ctx.supabase.from('insights').insert({
    org_id: ctx.orgId,
    intent_id: intentId,
    category: 'channel_gap',
    severity: 'high',
    title: 'You are only selling on Shopify',
    body: `Your store is only reachable through your Shopify domain. Expand to: (1) Etsy — $0.20 listing fee, 6.5% transaction, instant access to 90M+ buyers, Printify integrates directly. (2) TikTok Shop — free to list, 1,000 followers to unlock, organic video discovery reaches 10k+ views from account with 0 followers. (3) Google free listings — submit Merchant Center feed, zero ad cost, feeds AI Mode at same time. (4) ChatGPT Shopping — Shopify stores are auto-integrated via Shop Pay; your products may already be discoverable by AI shoppers. Each channel adds a separate zero-CAC revenue stream.`,
    citations: [],
    model: 'shopify-admin-audit-v2',
    provider: 'shopify-admin',
    generated_at: new Date().toISOString(),
  });

  // ── Creator Playbook ──
  await ctx.supabase.from('insights').insert({
    org_id: ctx.orgId,
    intent_id: intentId,
    category: 'creator_playbook',
    severity: 'medium',
    title: 'First-sale content playbook',
    body: `Find 3-5 micro-creators (1k-50k followers) in your niche. Send free product + $50-150 per post (total <$1,000 for full set). Formats that convert: design-process timelapses (show creation on TikTok), unboxing/reaction videos (social proof), niche skits (insider humor + product reveal). Micro-creators drive ~60% of TikTok Shop GMV. Gifting + small payment = 2.3× engagement vs gifting alone. Repurpose their content as paid ad creative (Spark Ads, $10-20/day). Post 1-2× daily at 7-9am and 7-10pm for first 30 days. Trend window: 3-7 days. Target: 1,000 followers in 2-4 weeks for TikTok Shop eligibility.`,
    citations: [],
    model: 'shopify-admin-audit-v2',
    provider: 'shopify-admin',
    generated_at: new Date().toISOString(),
  });
  try {
    const flagsSummary =
      byFlag.size > 0
        ? [...byFlag.entries()].map(
            ([code, { severity, products }]) =>
              `${FLAG_TITLE[code]} (${severity}, ${products.length} products)`,
          )
        : ['No flags raised'];
    const productSample = audit.rows
      .slice(0, 15)
      .map(
        (r) =>
          `${r.product.title} | ${r.product.productType || 'no-type'} | $${r.margin.priceMinCAD} | ${r.margin.marginPct?.toFixed(0) ?? '?'}% margin | ${r.flags.length} flags`,
      );

    const llmPrompt = `You are auditing a Shopify store named "${audit.shop.name}" (${storeUrl}) with ${audit.totalProducts} products in ${audit.totalCollections} collections, operating in ${audit.shopCurrency}. Plan: ${audit.shop.plan?.displayName ?? 'unknown'}.

Store-level SEO: homepage meta description ${seoSignals.hasMetaDescription ? `present (${seoSignals.metaDescriptionLength} chars)` : 'MISSING'}, structured data ${seoSignals.hasStructuredData ? 'present' : 'MISSING'}, sitemap ${seoSignals.hasSitemap ? 'OK' : 'MISSING'}, robots.txt ${seoSignals.hasRobotsTxt ? 'OK' : 'MISSING'}.

Audit score: ${score}/100.

Flag summary:
${flagsSummary.join('\n')}

Product sample (price in ${audit.shopCurrency}):
${productSample.join('\n')}

Output a JSON object with:
- "narrative": 2-3 paragraph executive summary of the store's health (tone: professional, direct, actionable)
- "positioning": 1 insight about brand/market positioning (or null if insufficient data)
- "marketing": 1 insight about marketing gaps (or null)
- "conversion": 1 insight about conversion optimization (or null)
- "trend": 1 insight about data trends (or null)
- "priorityActions": array of 3-5 specific actions, each with "action" (string), "effort" ("small"|"medium"|"large"), "impact" ("high"|"medium"|"low")

Respond ONLY with valid JSON, no markdown wrapping.`;

    const llmResult = await proxyLlm(ctx.supabase, ctx.orgId, llmPrompt);
    if (llmResult.content && llmResult.provider !== 'heuristic') {
      const parsed = JSON.parse(llmResult.content) as {
        narrative?: string;
        positioning?: { title: string; body: string } | null;
        marketing?: { title: string; body: string } | null;
        conversion?: { title: string; body: string } | null;
        trend?: { title: string; body: string } | null;
        priorityActions?: { action: string; effort: string; impact: string }[];
      };

      if (parsed.narrative) {
        await ctx.supabase.from('insights').insert({
          org_id: ctx.orgId,
          intent_id: intentId,
          category: 'positioning',
          severity: score < 50 ? 'high' : score < 75 ? 'medium' : 'low',
          title: 'Audit Narrative',
          body: parsed.narrative.slice(0, 5000),
          citations: [],
          model: llmResult.model,
          provider: llmResult.provider,
          generated_at: new Date().toISOString(),
        });
      }

      for (const cat of ['positioning', 'marketing', 'conversion', 'trend'] as const) {
        const item = parsed[cat];
        if (item?.title && item.body) {
          await ctx.supabase.from('insights').insert({
            org_id: ctx.orgId,
            intent_id: intentId,
            category: cat,
            severity: 'medium',
            title: item.title,
            body: item.body.slice(0, 5000),
            citations: [],
            model: llmResult.model,
            provider: llmResult.provider,
            generated_at: new Date().toISOString(),
          });
        }
      }
    }
  } catch (_err) {
    // LLM is best-effort; deterministic insights are already written.
    console.warn('[worker] LLM synthesis failed:', String(_err));
  }

  // ── First-Sale Playbook (deterministic, always generated) ──
  const firstSalePlan = buildFirstSalePlaybook(aiReadiness, firstSaleMath, audit.shop.name);

  // Persist to reports table (create or update) for the report-generate endpoint
  const reportRow = {
    org_id: ctx.orgId,
    intent_id: intentId,
    executive_summary: `First-sale readiness audit for ${audit.shop.name}. AI Shopping readiness: ${aiReadiness.score}/100. ${firstSaleMath ? `Margin: ${firstSaleMath.grossMarginPct.toFixed(0)}%, break-even ROAS: ${firstSaleMath.breakEvenRoas.toFixed(1)}×, recommended channel: ${firstSaleMath.recommendedChannel}.` : 'No margin data available.'}`,
    sprint_recommendation: firstSaleMath
      ? `Start with ${firstSaleMath.recommendedChannel} ads at $${firstSaleMath.dailyBudget}/day using creator content as ad creative. Estimated first-sale cost: ~$${firstSaleMath.estimatedFirstSaleCost}. Simultaneously submit GMC feed, add Product schema, and list on Etsy for zero-CAC channels.`
      : 'Focus on channel expansion (Etsy, TikTok Shop) and AI agent readiness (GMC feed, Product schema) before scaling paid ads.',
    first_sale_plan: firstSalePlan as unknown as Json,
    finding_count: 4,
    generated_by: userId,
  };

  const { data: existingReport } = await ctx.supabase
    .from('reports')
    .select('id')
    .eq('intent_id', intentId)
    .maybeSingle();

  if (existingReport) {
    await ctx.supabase
      .from('reports')
      .update({ first_sale_plan: firstSalePlan as unknown as Json })
      .eq('intent_id', intentId);
  } else {
    await ctx.supabase.from('reports').insert(reportRow);
  }

  // ── Mark intent succeeded ──
  await ctx.supabase
    .from('intents')
    .update({
      status: 'succeeded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', intentId);

  await ctx.supabase.from('audit_log').insert({
    org_id: ctx.orgId,
    user_id: userId,
    action: 'analyze.shopify_catalog',
    outcome: 'success',
    input_hash: urlHash,
    provider: 'shopify-admin',
    duration_ms: 0,
    metadata: {
      totalProducts: audit.totalProducts,
      totalCollections: audit.totalCollections,
      score,
      currency: audit.shopCurrency,
      flagCount: byFlag.size,
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

  const { data: runningRow } = await ctx.supabase
    .from('intents')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', intentId)
    .select('user_id')
    .single();
  const userId = runningRow?.user_id ?? ctx.orgId;

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
        await ctx.supabase
          .from('intents')
          .update({
            status: 'failed',
            error_code: 'SHOPIFY_CATALOG_ANALYZE_FAILED',
            error_message: String(err),
            updated_at: new Date().toISOString(),
          })
          .eq('id', intentId);
        await ctx.supabase.from('audit_log').insert({
          org_id: ctx.orgId,
          user_id: userId,
          action: 'analyze.shopify_catalog',
          outcome: 'error',
          input_hash: await sha256(url),
          provider: 'shopify-admin',
          duration_ms: Date.now() - startMs,
          metadata: {},
        });
      }
      return;
    }
  }

  try {
    const result = await proxyFirecrawl(ctx.supabase, ctx.orgId, url);
    const urlHash = await sha256(url);

    const { data: source } = await ctx.supabase
      .from('sources')
      .insert({
        org_id: ctx.orgId,
        intent_id: intentId,
        platform: platform ?? 'shopify',
        url,
        url_hash: urlHash,
        raw_markdown: result.markdown,
        metadata: result.metadata,
      })
      .select('id')
      .single();

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
      org_id: ctx.orgId,
      user_id: userId,
      action: 'scrape.firecrawl',
      outcome: 'success',
      input_hash: urlHash,
      provider: 'firecrawl',
      duration_ms: durationMs,
      metadata: {},
    });

    await ctx.supabase.rpc('archive_message', {
      p_queue_name: 'q:scrape',
      p_msg_id: envelope.data.msg_id,
    });
  } catch (err) {
    await ctx.supabase
      .from('intents')
      .update({
        status: 'failed',
        error_code: 'SCRAPE_FAILED',
        error_message: String(err),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intentId);
    await ctx.supabase.from('audit_log').insert({
      org_id: ctx.orgId,
      user_id: userId,
      action: 'scrape.firecrawl',
      outcome: 'error',
      input_hash: await sha256(url),
      provider: 'firecrawl',
      duration_ms: Date.now() - startMs,
      metadata: {},
    });
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
  const userId = await resolveIntentUserId(ctx.supabase, intentId, ctx.orgId);

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

    await ctx.supabase
      .from('intents')
      .update({
        status: 'succeeded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', intentId);

    await ctx.supabase.from('audit_log').insert({
      org_id: ctx.orgId,
      user_id: userId,
      action: 'llm.chat',
      outcome: 'success',
      input_hash: '0'.repeat(64),
      provider: llmResult.provider,
      duration_ms: 0,
      metadata: {},
    });

    await ctx.supabase.rpc('archive_message', {
      p_queue_name: 'q:analyze',
      p_msg_id: envelope.data.msg_id,
    });
  } catch (err) {
    await ctx.supabase
      .from('intents')
      .update({
        status: 'failed',
        error_code: 'ANALYZE_FAILED',
        error_message: String(err),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intentId);
    await ctx.supabase.from('audit_log').insert({
      org_id: ctx.orgId,
      user_id: userId,
      action: 'llm.chat',
      outcome: 'error',
      input_hash: '0'.repeat(64),
      provider: 'unknown',
      duration_ms: 0,
      metadata: {},
    });
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

  const { data: runningRow } = await ctx.supabase
    .from('intents')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', intentId)
    .select('user_id')
    .single();
  const userId = runningRow?.user_id ?? ctx.orgId;

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

    const { data: snapshot } = await ctx.supabase
      .from('competitor_snapshots')
      .insert({
        org_id: ctx.orgId,
        competitor_id: competitorId,
        product_count: prices.length || null,
        price_points: prices,
        source,
      })
      .select('id')
      .single();

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

    await ctx.supabase
      .from('intents')
      .update({
        status: 'succeeded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', intentId);

    await ctx.supabase.from('audit_log').insert({
      org_id: ctx.orgId,
      user_id: userId,
      action: 'monitor.competitor',
      outcome: 'success',
      input_hash: await sha256(competitor.url),
      provider: source,
      duration_ms: 0,
      metadata: { competitorId, priceCount: prices.length, snapshotId: snapshot?.id ?? null },
    });

    await ctx.supabase.rpc('archive_message', {
      p_queue_name: 'q:monitor',
      p_msg_id: envelope.data.msg_id,
    });
  } catch (err) {
    await ctx.supabase
      .from('intents')
      .update({
        status: 'failed',
        error_code: 'MONITOR_FAILED',
        error_message: String(err),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intentId);
    await ctx.supabase.from('audit_log').insert({
      org_id: ctx.orgId,
      user_id: userId,
      action: 'monitor.competitor',
      outcome: 'error',
      input_hash: '0'.repeat(64),
      provider: 'tavily',
      duration_ms: 0,
      metadata: { competitorId },
    });
  }
};
