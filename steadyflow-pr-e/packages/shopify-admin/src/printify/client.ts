import { safeStringify } from '../util/redact.js';
import {
  PrintifyCatalogResponseSchema,
  ShopsListResponseSchema,
  type PrintifyCatalogResponse,
  type PrintifyShop,
} from './schema.js';

const BASE_URL = 'https://api.printify.com/v1';

export class PrintifyClient {
  private readonly token: string;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  constructor(token: string, opts: { maxRetries?: number; baseBackoffMs?: number } = {}) {
    this.token = token;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
  }

  /**
   * List all shops in the Printify account.
   */
  async listShops(): Promise<PrintifyShop[]> {
    const raw = await this.request<unknown>('/shops.json');
    const parsed = ShopsListResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Printify /shops response failed validation:\n${parsed.error.issues
          .map((i: { path: (string | number)[]; message: string }) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      );
    }
    return parsed.data;
  }

  /**
   * Fetch all products in a shop with their variants.
   * Paginates through all pages.
   */
  async fetchShopCatalog(shopId: number): Promise<PrintifyCatalogResponse[]> {
    const all: PrintifyCatalogResponse[] = [];
    let page = 1;
    const perPage = 100;

    for (;;) {
      const url = `/shops/${shopId}/products.json?page=${page}&limit=${perPage}`;
      const raw = await this.request<unknown[]>(url);
      if (!Array.isArray(raw) || raw.length === 0) break;

      for (const item of raw) {
        const parsed = PrintifyCatalogResponseSchema.safeParse(item);
        if (parsed.success) {
          all.push(parsed.data);
        } else {
          // Skip malformed items but continue
          console.warn(
            `[printify] Skipping malformed product on page ${page}: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
          );
        }
      }

      if (raw.length < perPage) break;
      page++;
      if (page > 50) break; // safety: max 5000 products
    }

    return all;
  }

  private async request<T>(path: string): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
          await this.sleep(Math.max(retryAfter * 1000, this.backoff(attempt)));
          attempt++;
          continue;
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Printify HTTP ${res.status}: ${text.slice(0, 500)}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt > this.maxRetries) break;
        await this.sleep(this.backoff(attempt));
      }
    }

    throw new Error(
      `Printify request failed after ${this.maxRetries + 1} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  private backoff(attempt: number): number {
    const exp = this.baseBackoffMs * Math.pow(2, attempt);
    const jitter = Math.random() * exp * 0.3;
    return Math.round(exp + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Re-export for convenience
export { safeStringify };
