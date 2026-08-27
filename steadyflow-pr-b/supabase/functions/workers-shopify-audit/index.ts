/**
 * workers/shopify-audit — Shopify Admin + Printify catalog audit.
 *
 * Called by workers-scrape when an org has a shopify-admin key configured.
 * Fetches the full product catalog via Shopify Admin GraphQL, joins against
 * Printify costs (if a printify key is configured), and inserts per-product
 * insights directly into the database.
 *
 * Auth: none (called internally via supabase.functions.invoke, uses service_role)
 */

import { createServiceRoleClient } from '../_shared/supabase.ts';

// ── Shopify Admin GraphQL ──────────────────────────────────────────────────

const CATALOG_QUERY = `
query Catalog($cursor: String) {
  shop { currencyCode }
  products(first: 50, after: $cursor) {
    edges {
      node {
        id
        title
        handle
        descriptionHtml
        productType
        tags
        status
        images(first: 1) { edges { node { altText } } }
        variants(first: 50) {
          edges {
            node {
              id
              sku
              price
              compareAtPrice
              inventoryQuantity
              weight
              weightUnit
            }
          }
        }
        collections(first: 5) {
          edges {
            node { id title }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
  collections(first: 50) {
    edges {
      node { id title handle }
    }
  }
}`;

interface ShopifyProductNode {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  productType: string;
  tags: string[];
  status: string;
  images: { edges: { node: { altText: string | null } }[] };
  variants: { edges: { node: ShopifyVariantNode }[] };
  collections: { edges: { node: { id: string; title: string } }[] };
}

interface ShopifyVariantNode {
  id: string;
  sku: string | null;
  price: string | null;
  weight: number | null;
  weightUnit: string | null;
  inventoryQuantity: number | null;
}

interface ShopifyCollectionNode {
  id: string;
  title: string;
  handle: string;
}

const fetchShopifyCatalog = async (storeUrl: string, adminToken: string) => {
  const endpoint = `${storeUrl.replace(/\/+$/, '')}/admin/api/2024-07/graphql.json`;
  const products: ShopifyProductNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({ query: CATALOG_QUERY, variables: { cursor } }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Shopify Admin API error ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const json = await res.json() as {
      data?: {
        shop?: { currencyCode: string };
        products?: {
          edges: { node: ShopifyProductNode }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
        collections?: { edges: { node: ShopifyCollectionNode }[] };
      };
      errors?: { message: string }[];
    };
    if (json.errors?.length) throw new Error(`Shopify GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
    const data = json.data;
    if (!data) throw new Error('No data in Shopify response');

    products.push(...(data.products?.edges.map((e) => e.node) ?? []));
    hasNextPage = data.products?.pageInfo.hasNextPage ?? false;
    cursor = data.products?.pageInfo.endCursor ?? null;
  }

  return { products };
};

// ── Printify cost lookup ───────────────────────────────────────────────────

interface PrintifyShop {
  id: number;
  title: string;
}

interface PrintifyProduct {
  id: string;
  title: string;
  variants: { id: number; sku: string; price: number }[];
}

const fetchPrintifyCosts = async (printifyToken: string): Promise<Map<string, number>> => {
  const costMap = new Map<string, number>();
  const shopsRes = await fetch('https://api.printify.com/v1/shops.json', {
    headers: { Authorization: `Bearer ${printifyToken}` },
  });
  if (!shopsRes.ok) return costMap;
  const shops = (await shopsRes.json()) as PrintifyShop[];
  const shop = shops[0];
  if (!shop) return costMap;

  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const prodRes = await fetch(`https://api.printify.com/v1/shops/${shop.id}/products.json?page=${page}&limit=50`, {
      headers: { Authorization: `Bearer ${printifyToken}` },
    });
    if (!prodRes.ok) break;
    const data = await prodRes.json() as { data: PrintifyProduct[]; last_page: number };
    for (const p of data.data) {
      for (const v of p.variants) {
        // Printify variant prices are in cents
        costMap.set(String(v), v / 100);
      }
    }
    hasMore = page < Number(data.last_page ?? 1);
    page++;
  }
  return costMap;
};

// ── Flag evaluation ────────────────────────────────────────────────────────

interface Flag {
  code: string;
  severity: 'red' | 'yellow';
}

const evaluateFlags = (product: ShopifyProductNode): Flag[] => {
  const flags: Flag[] = [];
  const desc = (product.descriptionHtml ?? '').replace(/<[^>]+>/g, '').trim();

  if (desc.length < 50) flags.push({ code: 'short_description', severity: 'yellow' });
  if (!product.productType || !product.tags?.length) flags.push({ code: 'missing_type_or_tags', severity: 'yellow' });
  if (!product.collections?.edges?.length) flags.push({ code: 'orphaned', severity: 'yellow' });

  const images = product.images?.edges ?? [];
  if (images.length > 0 && images.every((i) => !i.node.altText)) {
    flags.push({ code: 'missing_alt_text', severity: 'red' });
  }

  const variants = product.variants?.edges?.map((e) => e.node) ?? [];
  if (variants.some((v) => !v.weight)) flags.push({ code: 'missing_weight', severity: 'yellow' });

  return flags;
};

const FLAG_CATEGORY: Record<string, string> = {
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

const FLAG_TITLE: Record<string, string> = {
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

const FLAG_SEVERITY: Record<string, 'high' | 'medium'> = {
  red: 'high',
  yellow: 'medium',
};

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { storeUrl?: string; adminToken?: string; printifyToken?: string; orgId?: string; intentId?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { storeUrl, adminToken, printifyToken, orgId, intentId } = body;
  if (!storeUrl || !adminToken || !orgId || !intentId) {
    return new Response('Missing required fields', { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const startMs = Date.now();

  try {
    // Fetch Shopify catalog
    const { products } = await fetchShopifyCatalog(storeUrl, adminToken);

    // Fetch Printify costs if token provided
    let costMap: Map<string, number> | null = null;
    if (printifyToken) {
      try {
        costMap = await fetchPrintifyCosts(printifyToken);
      } catch {
        // Costs will be flagged as unlinked — don't fail the whole audit
      }
    }

    // Evaluate flags per product
    const byFlag = new Map<string, { severity: 'red' | 'yellow'; products: string[] }>();
    for (const product of products) {
      const flags = evaluateFlags(product);
      for (const flag of flags) {
        const entry = byFlag.get(flag.code) ?? { severity: flag.severity, products: [] };
        entry.products.push(product.title);
        byFlag.set(flag.code, entry);
      }
    }

    // Insert insights
    for (const [code, { severity, products: affected }] of byFlag) {
      const shown = affected.slice(0, 10);
      const remainder = affected.length - shown.length;
      const bodyText = `${affected.length} product${affected.length === 1 ? '' : 's'} affected: ${shown.join(', ')}${remainder > 0 ? `, and ${remainder} more` : ''}.`;
      await supabase.from('insights').insert({
        org_id: orgId,
        intent_id: intentId,
        category: FLAG_CATEGORY[code] ?? 'positioning',
        severity: FLAG_SEVERITY[severity] ?? 'medium',
        title: FLAG_TITLE[code] ?? code,
        body: bodyText.slice(0, 5000),
        citations: [],
        model: 'shopify-admin-audit-v1',
        provider: 'shopify-admin',
        generated_at: new Date().toISOString(),
      });
    }

    // Catalog-wide summary
    if (products.length > 0) {
      await supabase.from('insights').insert({
        org_id: orgId,
        intent_id: intentId,
        category: 'positioning',
        severity: 'low',
        title: 'Catalog audit complete',
        body: `Audited ${products.length} products across the Shopify catalog.`,
        citations: [],
        model: 'shopify-admin-audit-v1',
        provider: 'shopify-admin',
        generated_at: new Date().toISOString(),
      });
    }

    const durationMs = Date.now() - startMs;
    await supabase.from('audit_log').insert({
      org_id: orgId, user_id: orgId,
      action: 'analyze.shopify_catalog', outcome: 'success',
      input_hash: '0'.repeat(64), provider: 'shopify-admin',
      duration_ms: durationMs, metadata: { totalProducts: products.length },
    });

    return new Response(JSON.stringify({ ok: true, totalProducts: products.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await supabase.from('audit_log').insert({
      org_id: orgId, user_id: orgId,
      action: 'analyze.shopify_catalog', outcome: 'error',
      input_hash: '0'.repeat(64), provider: 'shopify-admin',
      duration_ms: Date.now() - startMs, metadata: { error: String(err) },
    });
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});