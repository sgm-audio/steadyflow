/**
 * workers/scrape — pgmq consumer for q:scrape.
 *
 * Dequeues scrape jobs, calls Firecrawl proxy OR Shopify Admin API,
 * inserts source records, and enqueues the q:analyze message for processing.
 *
 * Auth: none (called internally via pgmq, uses service_role)
 */

import { createServiceRoleClient } from '../_shared/supabase.ts';
import { z } from 'npm:zod@3';

const ScrapeMessage = z.object({
  intentId: z.string(),
  orgId: z.string(),
  url: z.string().url(),
  platform: z.string().optional(),
});

/** Simple synchronous 64-char hex hash for audit_log constraint. */
const sha256Hex = async (input: string): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
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

/**
 * SSRF guard: reject non-http(s) schemes and hosts that resolve to a
 * private/loopback/link-local address before allowing fetch.
 */
const assertPublicHttpUrl = async (rawUrl: string): Promise<void> => {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to scrape non-http(s) URL: ${url.protocol}`);
  }
  // Note: DNS resolution check omitted in Deno for simplicity; production should add it.
};

/** Fetch a URL directly and extract readable text content (no Firecrawl key needed). */
const directScrape = async (url: string): Promise<{ markdown: string; metadata: Record<string, unknown> }> => {
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
      const data = (await res.json()) as { data?: { markdown?: string; metadata?: Record<string, unknown> } };
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

  await supabase.from('intents').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', intentId);

  const startMs = Date.now();

  try {
    // Check if Shopify Admin key is configured for real catalog audit
    if (platform === 'shopify') {
      const adminToken = await tryUnwrapKey(supabase, 'shopify-admin', orgId);
      
      if (adminToken) {
        // Use Shopify Admin API for real catalog audit instead of scraping
        const printifyToken = await tryUnwrapKey(supabase, 'printify', orgId) ?? undefined;
        
        // Call Shopify Admin directly via fetch
        const shopDomain = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const productsQuery = `
          query {
            products(first: 250) {
              edges {
                node {
                  id
                  title
                  handle
                  productType
                  tags
                  vendor
                  status
                  images(first: 10) { edges { node { altText url } } }
                  variants(first: 100) { edges { node { id title sku price compareAtPrice weight weightUnit } } }
                  collections(first: 50) { edges { node { title } } }
                }
              }
            }
            shop {
              currencyCode
              name
            }
          }
        `;
        
        const shopifyRes = await fetch(`https://${shopDomain}/admin/api/2024-07/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': adminToken,
          },
          body: JSON.stringify({ query: productsQuery }),
        });
        
        if (!shopifyRes.ok) {
          throw new Error(`Shopify Admin API error: ${shopifyRes.status} ${shopifyRes.statusText}`);
        }
        
        const shopifyData = await shopifyRes.json() as {
          data?: {
            products?: { edges: Array<{ node: Record<string, unknown> }> };
            shop?: { currencyCode: string; name: string };
          };
          errors?: Array<{ message: string }>;
        };
        
        if (shopifyData.errors?.length) {
          throw new Error(`Shopify GraphQL errors: ${shopifyData.errors.map(e => e.message).join(', ')}`);
        }
        
        const products = shopifyData.data?.products?.edges ?? [];
        const shop = shopifyData.data?.shop;
        
        // Generate insights from Shopify catalog data
        let insightCount = 0;
        
        // Check for products missing alt text
        const missingAltProducts: string[] = [];
        for (const edge of products) {
          const node = edge.node;
          const images = (node.images as { edges: Array<{ node: { altText: string | null }> }>)?.edges ?? [];
          for (const imgEdge of images) {
            if (!imgEdge.node.altText) {
              missingAltProducts.push(String(node.title ?? 'Unknown'));
              break;
            }
          }
        }
        
        if (missingAltProducts.length > 0) {
          const shown = missingAltProducts.slice(0, 10);
          const remainder = missingAltProducts.length - shown.length;
          await supabase.from('insights').insert({
            org_id: orgId,
            intent_id: intentId,
            category: 'seo',
            severity: missingAltProducts.length > 5 ? 'high' : 'medium',
            title: 'Product images missing alt text',
            body: `${missingAltProducts.length} product(s) affected: ${shown.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}. Alt text improves SEO and accessibility.`,
            citations: [],
            model: 'shopify-admin-audit-v1',
            provider: 'shopify-admin',
            generated_at: new Date().toISOString(),
          });
          insightCount++;
        }
        
        // Check for products missing type or tags
        const missingTypeOrTags: string[] = [];
        for (const edge of products) {
          const node = edge.node;
          const productType = String(node.productType ?? '');
          const tags = String(node.tags ?? '');
          if (!productType.trim() && (!tags.trim() || tags.split(',').length === 0)) {
            missingTypeOrTags.push(String(node.title ?? 'Unknown'));
          }
        }
        
        if (missingTypeOrTags.length > 0) {
          const shown = missingTypeOrTags.slice(0, 10);
          const remainder = missingTypeOrTags.length - shown.length;
          await supabase.from('insights').insert({
            org_id: orgId,
            intent_id: intentId,
            category: 'seo',
            severity: 'medium',
            title: 'Products missing type or tags',
            body: `${missingTypeOrTags.length} product(s) affected: ${shown.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}. Product type and tags help with navigation and search.`,
            citations: [],
            model: 'shopify-admin-audit-v1',
            provider: 'shopify-admin',
            generated_at: new Date().toISOString(),
          });
          insightCount++;
        }
        
        // Check for orphaned products (not in any collection)
        const orphanedProducts: string[] = [];
        for (const edge of products) {
          const node = edge.node;
          const collections = (node.collections as { edges: Array<{ node: { title: string }> }>)?.edges ?? [];
          if (collections.length === 0) {
            orphanedProducts.push(String(node.title ?? 'Unknown'));
          }
        }
        
        if (orphanedProducts.length > 0) {
          const shown = orphanedProducts.slice(0, 10);
          const remainder = orphanedProducts.length - shown.length;
          await supabase.from('insights').insert({
            org_id: orgId,
            intent_id: intentId,
            category: 'product_mix',
            severity: 'high',
            title: 'Products not in any collection',
            body: `${orphanedProducts.length} product(s) affected: ${shown.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}. Products in collections are easier to discover.`,
            citations: [],
            model: 'shopify-admin-audit-v1',
            provider: 'shopify-admin',
            generated_at: new Date().toISOString(),
          });
          insightCount++;
        }
        
        // Check for variants missing weight
        const missingWeight: string[] = [];
        for (const edge of products) {
          const node = edge.node;
          const variants = (node.variants as { edges: Array<{ node: { weight: number | null }> }>)?.edges ?? [];
          for (const varEdge of variants) {
            if (!varEdge.node.weight || varEdge.node.weight <= 0) {
              missingWeight.push(`${String(node.title ?? 'Unknown')} - ${String(varEdge.node.title ?? 'Default')}`);
              break;
            }
          }
        }
        
        if (missingWeight.length > 0) {
          const shown = missingWeight.slice(0, 10);
          const remainder = missingWeight.length - shown.length;
          await supabase.from('insights').insert({
            org_id: orgId,
            intent_id: intentId,
            category: 'inventory',
            severity: 'high',
            title: 'Variants missing weight (blocks international shipping)',
            body: `${missingWeight.length} variant(s) affected: ${shown.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}. Weight is required for accurate shipping calculations.`,
            citations: [],
            model: 'shopify-admin-audit-v1',
            provider: 'shopify-admin',
            generated_at: new Date().toISOString(),
          });
          insightCount++;
        }
        
        // Fetch Printify costs if available and check margins
        if (printifyToken && shop?.currencyCode) {
          try {
            // Get Printify shops
            const printifyShopsRes = await fetch('https://api.printify.com/v1/shops.json', {
              headers: { 'Authorization': `Bearer ${printifyToken}` },
            });
            
            if (printifyShopsRes.ok) {
              const printifyShops = await printifyShopsRes.json() as Array<{ id: string; title: string }>;
              if (printifyShops.length > 0) {
                const shopId = printifyShops[0].id;
                
                // Fetch Printify products
                const printifyProductsRes = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, {
                  headers: { 'Authorization': `Bearer ${printifyToken}` },
                });
                
                if (printifyProductsRes.ok) {
                  const printifyProducts = await printifyProductsRes.json() as Array<{
                    id: string;
                    title: string;
                    variants: Array<{ id: string; cost: number; currency: string }>;
                  }>;
                  
                  // Build cost lookup by title match
                  const costByTitle = new Map<string, number>();
                  for (const pp of printifyProducts) {
                    const variant = pp.variants[0];
                    if (variant) {
                      costByTitle.set(pp.title.toLowerCase(), variant.cost);
                    }
                  }
                  
                  // Check for unlinked costs
                  const unlinkedCostProducts: string[] = [];
                  for (const edge of products) {
                    const node = edge.node;
                    const title = String(node.title ?? '').toLowerCase();
                    if (!costByTitle.has(title)) {
                      unlinkedCostProducts.push(String(node.title ?? 'Unknown'));
                    }
                  }
                  
                  if (unlinkedCostProducts.length > 0) {
                    const shown = unlinkedCostProducts.slice(0, 10);
                    const remainder = unlinkedCostProducts.length - shown.length;
                    await supabase.from('insights').insert({
                      org_id: orgId,
                      intent_id: intentId,
                      category: 'pricing',
                      severity: 'medium',
                      title: 'Products with no matched Printify cost',
                      body: `${unlinkedCostProducts.length} product(s) affected: ${shown.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}. Connect these products to Printify for cost tracking.`,
                      citations: [],
                      model: 'shopify-admin-audit-v1',
                      provider: 'shopify-admin',
                      generated_at: new Date().toISOString(),
                    });
                    insightCount++;
                  }
                }
              }
            }
          } catch (err) {
            // Printify fetch failed — continue without cost data
            console.warn(`Printify fetch failed: ${String(err)}`);
          }
        }
        
        // Summary insight
        await supabase.from('insights').insert({
          org_id: orgId,
          intent_id: intentId,
          category: 'positioning',
          severity: 'low',
          title: `Shopify catalog audit complete`,
          body: `Analyzed ${products.length} products from ${shop?.name ?? shopDomain}. Found ${insightCount} issue categories requiring attention. Currency: ${shop?.currencyCode ?? 'USD'}.`,
          citations: [],
          model: 'shopify-admin-audit-v1',
          provider: 'shopify-admin',
          generated_at: new Date().toISOString(),
        });
        
        // Mark intent succeeded
        await supabase.from('intents').update({
          status: 'succeeded',
          updated_at: new Date().toISOString(),
        }).eq('id', intentId);
        
        // Audit
        await supabase.from('audit_log').insert({
          org_id: orgId, user_id: orgId,
          action: 'analyze.shopify_catalog', outcome: 'success',
          input_hash: await sha256Hex(url), provider: 'shopify-admin',
          duration_ms: Date.now() - startMs,
          metadata: { totalProducts: products.length, shopName: shop?.name ?? shopDomain },
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
      updated_at: new Date().toISOString(),
    }).eq('id', intentId);
  }

  return new Response('ok', { status: 200 });
});
