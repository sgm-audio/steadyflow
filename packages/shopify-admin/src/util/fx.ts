/**
 * FX rate fetcher with 24hr in-memory cache.
 * Uses open.er-api.com (no auth required).
 * Falls back to the provided rate on failure.
 */

interface CachedRate {
  rate: number;
  fetchedAt: number;
  source: 'live' | 'fallback';
}

let cache: CachedRate | null = null;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

interface ErApiResponse {
  result?: string;
  rates?: { CAD?: number };
  'error-type'?: string;
}

export async function getUsdToCadRate(fallback: number): Promise<CachedRate> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);
    const res = await fetch(FX_ENDPOINT, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`FX endpoint HTTP ${res.status}`);
    const data = (await res.json()) as ErApiResponse;

    if (data.result !== 'success' || typeof data.rates?.CAD !== 'number') {
      throw new Error(
        `FX endpoint returned invalid payload: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }

    cache = {
      rate: data.rates.CAD,
      fetchedAt: now,
      source: 'live',
    };
    return cache;
  } catch {
    cache = {
      rate: fallback,
      fetchedAt: now,
      source: 'fallback',
    };
    return cache;
  }
}

export function clearFxCache(): void {
  cache = null;
}
