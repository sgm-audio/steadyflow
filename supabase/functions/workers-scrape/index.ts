/**
 * workers/scrape — pgmq consumer for q:scrape.
 *
 * Dequeues scrape jobs, calls Firecrawl proxy OR the shared Shopify Admin
 * audit engine, inserts source/insight records, and enqueues q:analyze.
 *
 * Shopify path imports the vendored `@steadyflow/shopify-admin` bundle
 * (supabase/functions/_shared/shopify-admin/) — the SAME code the Node worker
 * runs, so findings and the leak list cannot drift between runtimes.
 *
 * Auth: none (called internally via pgmq, uses service_role)
 */

import { z } from 'npm:zod@3';
import {
  aggregateFlags,
  analyzeStorefrontHtml,
  buildLeakList,
  computeAuditScore,
  describeFlag,
  extractAppFingerprints,
  fetchPerformanceSignals,
  runCatalogAudit,
  scoreRubric,
  totalEstimatedImpact,
} from '../_shared/shopify-admin/index.js';
import { createServiceRoleClient } from '../_shared/supabase.ts';

const ScrapeMessage = z.object({
  intentId: z.string(),
  orgId: z.string(),
  url: z.string().url(),
  platform: z.string().optional(),
});

/** Simple synchronous 64-char hex hash for audit_log constraint. */
const sha256Hex = async (input: string): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Persist a snapshot of the audit's rubric score for S6 (recurring-audit
 * diff). Idempotent on `intent_id` — re-running the worker on the same
 * intent updates the row instead of duplicating.
 *
 * Best-effort: callers wrap with `.catch(() => {})` because score_history
 * failure must not fail an audit that otherwise completed successfully.
 */
const recordScoreHistory = async (
  supabase: ReturnType<typeof createServiceRoleClient>,
  args: {
    orgId: string;
    intentId: string;
    url: string;
    rubric: ReturnType<typeof scoreRubric>;
    severityCounts: { critical: number; high: number; medium: number; low: number };
    findingCount: number;
  },
): Promise<void> => {
  // shop_domain is NOT NULL in score_history; derive it from the URL the
  // worker was called with. If parsing fails, skip silently — better to
  // miss one history row than to crash the audit.
  let shopDomain: string;
  try {
    shopDomain = new URL(args.url).host;
  } catch {
    return;
  }
  const categoryScores: Record<string, { score: number; max: number }> = {};
  for (const c of args.rubric.categoryScores) {
    categoryScores[c.id] = { score: c.score, max: c.maxPoints };
  }
  await supabase.from('score_history').upsert(
    {
      org_id: args.orgId,
      intent_id: args.intentId,
      shop_domain: shopDomain,
      total_score: Math.round(args.rubric.totalScore),
      grade: args.rubric.grade,
      category_scores: categoryScores,
      critical_count: args.severityCounts.critical,
      high_count: args.severityCounts.high,
      medium_count: args.severityCounts.medium,
      low_count: args.severityCounts.low,
      finding_count: args.findingCount,
      rubric_version: 'v1',
    },
    { onConflict: 'intent_id' },
  );
};

/** Try to unwrap a provider key. Returns null if key is missing or invalid. */
const tryUnwrapKey = async (
  supabase: ReturnType<typeof createServiceRoleClient>,
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

const isPrivateIpv4 = (ip: string): boolean =>
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

const isPrivateIp = (ip: string): boolean => {
  const lower = ip.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) return isPrivateIpv4(lower);
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)?.[1];
  return v4Mapped ? isPrivateIpv4(v4Mapped) : false;
};

/**
 * SSRF guard: reject non-http(s) schemes and hosts that resolve to a
 * private/loopback/link-local address (cloud metadata endpoints, internal
 * services) before a scrape is allowed to fetch a user-submitted URL.
 * Mirrors the Node worker's guard; checks resolve-time only, not connect-time,
 * so a DNS-rebind (short-TTL record swapped between this check and fetch())
 * isn't covered.
 */
const assertPublicHttpUrl = async (rawUrl: string): Promise<void> => {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to scrape non-http(s) URL: ${url.protocol}`);
  }
  if (url.hostname === 'localhost') {
    throw new Error(`Refusing to scrape a private/loopback URL: ${url.hostname}`);
  }
  const records = await Promise.all([
    Deno.resolveDns(url.hostname, 'A').catch(() => [] as string[]),
    Deno.resolveDns(url.hostname, 'AAAA').catch(() => [] as string[]),
  ]);
  const addresses = records.flat();
  if (addresses.length === 0 || addresses.some((ip) => isPrivateIp(ip))) {
    throw new Error(`Refusing to scrape URL resolving to a private address: ${url.hostname}`);
  }
};

/** Fetch a URL directly and extract readable text content (no Firecrawl key needed). */
const directScrape = async (
  url: string,
): Promise<{ markdown: string; metadata: Record<string, unknown> }> => {
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
    metadata: { url, title, description, scrapedAt: new Date().toISOString() },
  };
};

/** Call Firecrawl API or fall back to direct scrape. */
const scrapeWithFirecrawl = async (
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  url: string,
): Promise<{ markdown: string; metadata: Record<string, unknown> }> => {
  const apiKey = await tryUnwrapKey(supabase, 'firecrawl', orgId);
  if (apiKey) {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        data?: { markdown?: string; metadata?: Record<string, unknown> };
      };
      return {
        markdown: data.data?.markdown ?? '',
        metadata: data.data?.metadata ?? { url, scrapedAt: new Date().toISOString() },
      };
    }
  }
  // Fallback: direct HTTP scrape
  return directScrape(url);
};

Deno.serve(async (_req: Request) => {
  const supabase = createServiceRoleClient();

  // Dequeue one message from q:scrape
  const { data: msg, error: deqError } = await supabase.rpc('dequeue_message', {
    p_queue_name: 'q:scrape',
  });

  if (deqError || !msg) return new Response('ok', { status: 200 });
  if (typeof msg !== 'object' || !msg) return new Response('ok', { status: 200 });

  const payload = (msg as { message?: Record<string, unknown> }).message ?? {};
  const parsed = ScrapeMessage.safeParse(payload);

  if (!parsed.success) return new Response('ok', { status: 200 });

  const { intentId, orgId, url, platform } = parsed.data;

  // audit_log.user_id has a foreign key to auth.users; orgId is not a valid
  // user_id, so writing it there always silently violated the FK and
  // dropped the audit row. Fetch the intent's real creator instead.
  const { data: runningRow } = await supabase
    .from('intents')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', intentId)
    .select('user_id')
    .single();
  const userId = (runningRow as { user_id: string } | null)?.user_id ?? orgId;

  const startMs = Date.now();
  let attemptedProvider: 'shopify-admin' | 'firecrawl' = 'firecrawl';

  try {
    // Shopify Admin key configured → run the shared catalog audit engine.
    if (platform === 'shopify') {
      const adminToken = await tryUnwrapKey(supabase, 'shopify-admin', orgId);
      const printifyToken = (await tryUnwrapKey(supabase, 'printify', orgId)) ?? undefined;

      if (adminToken) {
        attemptedProvider = 'shopify-admin';

        const audit = await runCatalogAudit({
          storeUrl: url,
          adminToken,
          ...(printifyToken ? { printifyToken } : {}),
        });

        const leakList = buildLeakList(
          audit.rows.map((r: { margin: { priceMinCAD: number }; flags: unknown[] }) => ({
            priceMinCAD: r.margin.priceMinCAD,
            flags: r.flags,
          })),
          audit.shopCurrency,
          {
            ...(audit.salesSummary ? { sales: audit.salesSummary } : {}),
            catalogFlags: audit.catalogFlags,
          },
        );
        const leakTotal = totalEstimatedImpact(leakList);
        const leakImpactByCode = new Map(
          leakList.map((l: { code: string; estimatedAnnualImpact: number }) => [
            l.code,
            l.estimatedAnnualImpact,
          ]),
        );
        const score = computeAuditScore(audit.rows);

        // Aggregate flags by code → one insight per finding type.
        const byFlag = new Map<string, { severity: 'red' | 'yellow'; products: string[] }>();
        for (const row of audit.rows) {
          for (const flag of row.flags) {
            const entry = byFlag.get(flag.code) ?? {
              severity: flag.severity as 'red' | 'yellow',
              products: [] as string[],
            };
            entry.products.push(row.product.title as string);
            byFlag.set(flag.code, entry);
          }
        }

        // Persist score snapshot for S6 (recurring-audit diff). Best-effort;
        // failure here must not fail an audit that otherwise succeeded.
        const rubric = scoreRubric(
          aggregateFlags(
            audit.rows.map((r: { flags: unknown[] }) => ({ flags: r.flags })),
            audit.catalogFlags,
          ),
          audit.rows.length,
        );
        const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const [, { severity }] of byFlag) {
          if (severity === 'red') severityCounts.high++;
          else severityCounts.medium++;
        }
        if (rubric.criticalCapped) severityCounts.critical = 1;
        await recordScoreHistory(supabase, {
          orgId,
          intentId,
          url,
          rubric,
          severityCounts,
          findingCount: byFlag.size + audit.catalogFlags.length,
        }).catch(() => {});

        for (const [code, { severity, products }] of byFlag) {
          const desc = describeFlag(code, severity);
          const impact = leakImpactByCode.get(code);
          const impactSuffix =
            impact !== undefined && impact > 0 ? ` ~$${impact.toLocaleString()}/yr` : '';
          const shown = products.slice(0, 3);
          const remainder = products.length - shown.length;
          await supabase.from('insights').insert({
            org_id: orgId,
            intent_id: intentId,
            category: desc.category,
            severity: desc.severity,
            title: desc.title,
            body: `${products.length} product${products.length === 1 ? '' : 's'} affected${remainder > 0 ? ` (${shown.join(', ')} + ${remainder} more)` : ''}${impactSuffix}`,
            citations: [],
            model: 'shopify-admin-audit-v2',
            provider: 'shopify-admin',
            generated_at: new Date().toISOString(),
          });
        }

        // Catalog-level flags (mix / assortment) — one insight per flag
        for (const flag of audit.catalogFlags) {
          const desc = describeFlag(flag.code, flag.severity);
          await supabase.from('insights').insert({
            org_id: orgId,
            intent_id: intentId,
            category: desc.category,
            severity: desc.severity,
            title: desc.title,
            body: flag.message.slice(0, 5000),
            citations: [],
            model: 'shopify-admin-audit-v2',
            provider: 'shopify-admin',
            generated_at: new Date().toISOString(),
          });
        }

        // Ranked Leak List summary
        if (leakList.length > 0) {
          const top = leakList
            .slice(0, 5)
            .map(
              (l: { title: string; estimatedAnnualImpact: number }, i: number) =>
                `${i + 1}. ${l.title} — ~$${l.estimatedAnnualImpact.toLocaleString()}/yr`,
            )
            .join('\n');
          await supabase.from('insights').insert({
            org_id: orgId,
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

        // Summary insight
        await supabase.from('insights').insert({
          org_id: orgId,
          intent_id: intentId,
          category: 'positioning',
          severity: 'low',
          title: `Shopify catalog audit complete (score ${score}/100)`,
          body: `Analyzed ${audit.totalProducts} products from ${audit.shop.name ?? url}. Found ${byFlag.size} finding categories. Currency: ${audit.shopCurrency}.`,
          citations: [],
          model: 'shopify-admin-audit-v2',
          provider: 'shopify-admin',
          generated_at: new Date().toISOString(),
        });

        // ── B3 — app fingerprint detection + persist ──
        // Best-effort storefront fetch (SSRF-guarded). Mirrors the Node
        // worker: render-blocking scripts, undimensioned images, app bloat.
        try {
          await assertPublicHttpUrl(url);
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteadyFlow/1.0)' },
          });
          if (res.ok) {
            const html = await res.text();
            const storefront = analyzeStorefrontHtml(html, new URL(url).hostname);
            if (storefront.appHosts.length > 0) {
              const apps = storefront.appHosts.map((h: { appName?: string; host: string }) => h.appName ?? h.host).join(', ');
              await supabase.from('insights').insert({
                org_id: orgId,
                intent_id: intentId,
                category: 'conversion',
                severity: storefront.appHosts.length >= 3 ? 'high' : 'medium',
                title: `App bloat: ${storefront.appHosts.length} third-party app${storefront.appHosts.length === 1 ? '' : 's'} loading scripts`,
                body: `Detected: ${apps}. Each app adds load time and a potential subscription overlap.`,
                citations: [],
                model: 'shopify-admin-audit-v2',
                provider: 'shopify-admin',
                generated_at: new Date().toISOString(),
              });
              const fingerprints = extractAppFingerprints(storefront, new URL(url).hostname);
              for (const fp of fingerprints) {
                try {
                  await supabase.rpc('upsert_app_fingerprint', {
                    p_org_id: orgId,
                    p_shop_domain: fp.shop_domain,
                    p_app_handle: fp.app_handle,
                    p_app_title: fp.app_title,
                    p_detection_source: fp.detection_source,
                    p_category: fp.category,
                  });
                } catch {
                  // ignore per-fingerprint failures
                }
              }
            }
          }
        } catch {
          // best-effort storefront analysis
        }

        // ── B7 — fetch PSI / CrUX performance signals (lab + field) ──
        try {
          const signals = await fetchPerformanceSignals(url, { timeoutMs: 10_000 });
          const cwvFailures: string[] = [];
          for (const sig of signals.signals) {
            if (!sig.available) continue;
            const lcp = sig.largestContentfulPaint;
            if (lcp && lcp.p50 >= (lcp.poor ?? 4000)) {
              cwvFailures.push(`LCP ${Math.round(lcp.p50)}ms (${sig.source})`);
            }
            const cls = sig.cumulativeLayoutShift;
            if (cls && cls.score < 0.9) {
              cwvFailures.push(`CLS ${cls.score.toFixed(2)} (${sig.source})`);
            }
          }
          if (cwvFailures.length > 0) {
            await supabase.from('insights').insert({
              org_id: orgId,
              intent_id: intentId,
              category: 'conversion',
              severity: 'high',
              title: `Core Web Vitals failing in ${cwvFailures.length} measurement${cwvFailures.length === 1 ? '' : 's'}`,
              body: `${cwvFailures.join('; ')}. Sourced from Google PageSpeed Insights (lab) and Chrome User Experience Report (field).`,
              citations: [],
              model: 'psi-crux-v1',
              provider: 'google-pagespeed',
              generated_at: new Date().toISOString(),
            });
          }
        } catch {
          // best-effort performance signals
        }

        // Mark intent succeeded
        await supabase
          .from('intents')
          .update({
            status: 'succeeded',
            updated_at: new Date().toISOString(),
          })
          .eq('id', intentId);

        // Audit
        await supabase.from('audit_log').insert({
          org_id: orgId,
          user_id: userId,
          action: 'analyze.shopify_catalog',
          outcome: 'success',
          input_hash: await sha256Hex(url),
          provider: 'shopify-admin',
          duration_ms: Date.now() - startMs,
          metadata: { totalProducts: audit.totalProducts, shopName: audit.shop.name ?? url, score },
        });

        // Archive the message
        await supabase.rpc('archive_message', {
          p_queue_name: 'q:scrape',
          p_msg_id: (msg as { msg_id: number }).msg_id,
        });

        return new Response('ok', { status: 200 });
      }
    }

    // No Shopify Admin key — fall back to Firecrawl scraping
    const result = await scrapeWithFirecrawl(supabase, orgId, url);
    const urlHash = await sha256Hex(url);

    // Insert source
    const { data: source, error: srcError } = await supabase
      .from('sources')
      .insert({
        org_id: orgId,
        intent_id: intentId,
        platform: platform ?? 'shopify',
        url,
        url_hash: urlHash,
        raw_markdown: result.markdown,
        metadata: result.metadata,
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
        platform: platform ?? 'shopify',
      },
    });

    // Audit
    await supabase.from('audit_log').insert({
      org_id: orgId,
      user_id: userId,
      action: 'scrape.firecrawl',
      outcome: 'success',
      input_hash: urlHash,
      provider: 'firecrawl',
      duration_ms: Date.now() - startMs,
      metadata: {},
    });

    // Archive the message
    await supabase.rpc('archive_message', {
      p_queue_name: 'q:scrape',
      p_msg_id: (msg as { msg_id: number }).msg_id,
    });
  } catch (err) {
    await supabase
      .from('intents')
      .update({
        status: 'failed',
        error_code:
          attemptedProvider === 'shopify-admin'
            ? 'SHOPIFY_CATALOG_ANALYZE_FAILED'
            : 'SCRAPE_FAILED',
        error_message: String(err),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intentId);
    await supabase.from('audit_log').insert({
      org_id: orgId,
      user_id: userId,
      action:
        attemptedProvider === 'shopify-admin' ? 'analyze.shopify_catalog' : 'scrape.firecrawl',
      outcome: 'error',
      input_hash: await sha256Hex(url),
      provider: attemptedProvider,
      duration_ms: Date.now() - startMs,
      metadata: {},
    });
  }

  return new Response('ok', { status: 200 });
});
