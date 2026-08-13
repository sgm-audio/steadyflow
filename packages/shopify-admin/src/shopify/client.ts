import { redact, safeStringify } from '../util/redact.js';
import {
  CatalogResponseSchema,
  CatalogPageSchema,
  type CatalogResponse,
  type ShopifyProduct,
} from './schema.js';
import { CATALOG_PAGE_QUERY, SALES_SUMMARY_QUERY } from './queries.js';

export interface ShopifyClientOptions {
  storeUrl: string;
  /** Legacy static admin token (deprecated by Shopify Jan 2026). */
  adminToken?: string | undefined;
  /** Dev Dashboard client ID — client credentials grant (2026 flow). */
  clientId?: string | undefined;
  /** Dev Dashboard client secret. */
  clientSecret?: string | undefined;
  maxRetries?: number;
  baseBackoffMs?: number;
  /** Maximum product pages to fetch (default 5 = 250 products). */
  maxPages?: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

/** Real sales signal derived from recent orders (`read_orders` scope). */
export interface SalesSummary {
  orderCount: number;
  totalRevenue: number;
  windowDays: number;
  averageOrderValue: number;
  monthlyOrders: number;
  /** True when the sample was capped at the page limit (250 orders). */
  capped: boolean;
}

const API_VERSION = '2026-07';

export class ShopifyClient {
  private readonly storeUrl: string;
  private readonly adminToken: string | undefined;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxPages: number;
  private shopHandle: string | undefined;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(opts: ShopifyClientOptions) {
    this.storeUrl = opts.storeUrl.replace(/\/+$/, '');
    this.adminToken = opts.adminToken;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
    this.maxPages = opts.maxPages ?? 5;
  }

  /**
   * Resolves the store's canonical *.myshopify.com handle from the store URL
   * by following Shopify's own redirect. Needed because the client
   * credentials grant (and the GraphQL endpoint) must target the myshopify
   * domain, not the custom domain (whose 301 drops the auth header).
   */
  private async resolveShopHandle(): Promise<string> {
    if (this.shopHandle) return this.shopHandle;

    const own = /^https?:\/\/([a-z0-9-]+)\.myshopify\.com/i.exec(this.storeUrl);
    const ownHandle = own?.[1];
    if (ownHandle) {
      this.shopHandle = ownHandle;
      return this.shopHandle;
    }

    const res = await fetch(`${this.storeUrl}/admin`, { method: 'GET', redirect: 'manual' });
    const location = res.headers.get('location') ?? '';
    const redirected = /([a-z0-9-]+)\.myshopify\.com/i.exec(location);
    const redirectedHandle = redirected?.[1];
    if (redirectedHandle) {
      this.shopHandle = redirectedHandle;
      return this.shopHandle;
    }

    throw new Error(`Could not resolve myshopify handle for ${this.storeUrl}`);
  }

  /**
   * Returns a valid access token. Prefers a static admin token; otherwise
   * exchanges the client ID + secret via the client credentials grant,
   * caching the short-lived token and refreshing it before expiry.
   */
  private async resolveToken(): Promise<string> {
    if (this.adminToken) return this.adminToken;
    if (!this.clientId || !this.clientSecret) {
      throw new Error('ShopifyClient: no adminToken and no clientId/clientSecret configured');
    }
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60_000) {
      return this.tokenCache.token;
    }

    const shop = await this.resolveShopHandle();
    const res = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify token exchange failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error('Shopify token exchange returned no access_token');

    this.tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 86400) * 1000 };
    return this.tokenCache.token;
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        const shop = await this.resolveShopHandle();
        const token = await this.resolveToken();
        const res = await fetch(`https://${shop}.myshopify.com/admin/api/${API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token,
            Accept: 'application/json',
          },
          body: JSON.stringify({ query, variables }),
        });

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
          await this.sleep(Math.max(retryAfter * 1000, this.backoff(attempt)));
          attempt++;
          continue;
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Shopify HTTP ${res.status}: ${text.slice(0, 500)}`);
        }

        const json = (await res.json()) as GraphQLResponse<T>;

        if (json.errors && json.errors.length > 0) {
          // Throttle errors come through here too
          const isThrottle = json.errors.some(
            (e) => typeof e.extensions?.code === 'string' && e.extensions.code.includes('THROTTLED'),
          );
          if (isThrottle && attempt < this.maxRetries) {
            await this.sleep(this.backoff(attempt));
            attempt++;
            continue;
          }
          throw new Error(
            `Shopify GraphQL errors: ${safeStringify(json.errors)}`,
          );
        }

        if (!json.data) {
          throw new Error('Shopify response missing data field');
        }

        return json.data;
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt > this.maxRetries) break;
        await this.sleep(this.backoff(attempt));
      }
    }

    throw new Error(
      `Shopify query failed after ${this.maxRetries + 1} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  /**
   * Fetches the full catalog across all product pages (up to maxPages × 50).
   * Returns a single CatalogResponse with all products merged.
   */
  async fetchCatalog(): Promise<CatalogResponse> {
    const allProducts: ShopifyProduct[] = [];
    let cursor: string | undefined;
    let shop: CatalogResponse['shop'] | undefined;
    let collections: CatalogResponse['collections'] | undefined;
    let pages = 0;

    do {
      const response = await this.query<unknown>(CATALOG_PAGE_QUERY, { cursor: cursor ?? null });
      const parsed = CatalogPageSchema.safeParse(response);
      if (!parsed.success) {
        if (pages === 0) {
          throw new Error(
            `Shopify response failed schema validation:\n${parsed.error.issues
              .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
              .join('\n')}`,
          );
        }
        break; // subsequent page parse failure is non-fatal
      }
      const page = parsed.data;

      if (pages === 0) {
        shop = page.shop;
        collections = page.collections;
      }

      allProducts.push(...page.products.edges.map((e) => e.node));
      cursor = page.products.pageInfo.endCursor ?? undefined;
      pages++;
    } while (pages < this.maxPages && pageInfoHasNext(cursor));

    if (!shop) throw new Error('No shop data in catalog response');

    return CatalogResponseSchema.parse({
      shop,
      products: { edges: allProducts.map((node) => ({ node })), pageInfo: { hasNextPage: false } },
      collections: collections ?? { edges: [] },
    });
  }

  /**
   * Fetches real sales signal (recent orders) for revenue-impact estimates.
   * Returns null when `read_orders` is not granted or the fetch fails, so the
   * caller can fall back to documented assumptions.
   */
  async fetchSalesSummary(): Promise<SalesSummary | null> {
    try {
      const data = await this.query<{
        orders?: {
          pageInfo?: { hasNextPage?: boolean };
          edges?: { node: { createdAt?: string; totalPriceSet?: { shopMoney?: { amount?: string } } } }[];
        };
      }>(SALES_SUMMARY_QUERY);

      const edges = data.orders?.edges ?? [];
      const amounts = edges
        .map((e) => Number(e.node.totalPriceSet?.shopMoney?.amount))
        .filter((n) => Number.isFinite(n) && n > 0);
      const timestamps = edges
        .map((e) => new Date(e.node.createdAt ?? '').getTime())
        .filter((t) => Number.isFinite(t));

      if (amounts.length === 0 || timestamps.length === 0) return null;

      const totalRevenue = amounts.reduce((a, b) => a + b, 0);
      const oldest = Math.min(...timestamps);
      const windowDays = Math.max(1, (Date.now() - oldest) / (1000 * 60 * 60 * 24));
      const orderCount = amounts.length;
      const averageOrderValue = totalRevenue / orderCount;
      const monthlyOrders = orderCount / (windowDays / 30.44);

      return {
        orderCount,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        windowDays: Math.round(windowDays * 10) / 10,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        monthlyOrders: Math.round(monthlyOrders * 10) / 10,
        capped: data.orders?.pageInfo?.hasNextPage ?? false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetches and validates a single page of the catalog response.
   * @deprecated Use fetchCatalog() for the paginated version.
   */
  async fetchCatalogLegacy(query: string): Promise<CatalogResponse> {
    const raw = await this.query<unknown>(query);
    const parsed = CatalogResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Shopify response failed schema validation:\n${parsed.error.issues
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      );
    }
    return parsed.data;
  }

  private backoff(attempt: number): number {
    // Exponential with jitter: 500, 1000, 2000, ...
    const exp = this.baseBackoffMs * Math.pow(2, attempt);
    const jitter = Math.random() * exp * 0.3;
    return Math.round(exp + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function pageInfoHasNext(cursor: string | undefined): boolean {
  return Boolean(cursor);
}

// Re-export for convenience
export { redact };
