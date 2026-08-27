import { redact, safeStringify } from '../util/redact.js';
import { CatalogResponseSchema, type CatalogResponse } from './schema.js';

export interface ShopifyClientOptions {
  storeUrl: string;
  adminToken: string;
  maxRetries?: number;
  baseBackoffMs?: number;
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

export class ShopifyClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  constructor(opts: ShopifyClientOptions) {
    // Normalize store URL: strip trailing slash, ensure https
    const base = opts.storeUrl.replace(/\/+$/, '');
    this.endpoint = `${base}/admin/api/2024-10/graphql.json`;
    this.token = opts.adminToken;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': this.token,
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
   * Fetches and validates the full catalog response.
   */
  async fetchCatalog(query: string): Promise<CatalogResponse> {
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

// Re-export for convenience
export { redact };
