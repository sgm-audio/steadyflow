import type { SpApiCredentials } from '../credential.js';
import { DEFAULT_HTTP_TIMEOUT_MS, withTimeout } from './http.js';
import { LwaClient } from './lwa.js';
import { amzDate, signSigV4 } from './signing.js';

const SP_API_SERVICE = 'execute-api';

export const SP_API_REGIONS: Record<SpApiCredentials['region'], { host: string; awsRegion: string }> =
  {
    na: { host: 'sellingpartnerapi-na.amazon.com', awsRegion: 'us-east-1' },
    eu: { host: 'sellingpartnerapi-eu.amazon.com', awsRegion: 'eu-west-1' },
    fe: { host: 'sellingpartnerapi-fe.amazon.com', awsRegion: 'us-west-2' },
  };

export interface SpApiClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
}

export interface SpApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  query?: Record<string, string | number>;
  body?: unknown;
}

export class SpApiHttpError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`[commerce/amazon] SP-API HTTP ${status}: ${body.slice(0, 500)}`);
    this.name = 'SpApiHttpError';
    this.status = status;
  }
}

function serializeQuery(query: Record<string, string | number> | undefined): string {
  if (!query) return '';
  return Object.keys(query)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(query[k]))}`)
    .join('&');
}

function extractPayload(res: unknown): Record<string, unknown> {
  if (res && typeof res === 'object' && 'payload' in res) {
    const p = (res as { payload?: unknown }).payload;
    if (p && typeof p === 'object') return p as Record<string, unknown>;
  }
  return (res ?? {}) as Record<string, unknown>;
}

/**
 * Amazon Selling Partner API client.
 * Every request is LWA-authenticated + AWS SigV4-signed and guarded by the
 * 5s hang timeout — a stalled endpoint rejects loudly, never hangs the worker.
 */
export class SpApiClient {
  private readonly lwa: LwaClient;

  constructor(
    private readonly creds: SpApiCredentials,
    private readonly opts: SpApiClientOptions = {},
  ) {
    this.lwa = new LwaClient({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      refreshToken: creds.refreshToken,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    });
  }

  async request(path: string, reqOpts: SpApiRequestOptions = {}): Promise<unknown> {
    const region = SP_API_REGIONS[this.creds.region];
    const method = reqOpts.method ?? 'GET';
    const queryStr = serializeQuery(reqOpts.query);
    const bodyStr = reqOpts.body === undefined ? '' : JSON.stringify(reqOpts.body);
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
    const maxRetries = this.opts.maxRetries ?? 3;
    const baseBackoffMs = this.opts.baseBackoffMs ?? 500;

    let attempt = 0;
    for (;;) {
      const url = `https://${region.host}${path}${queryStr ? `?${queryStr}` : ''}`;
      const token = await this.lwa.getAccessToken();
      const signed = signSigV4(
        {
          method,
          path,
          ...(queryStr ? { query: queryStr } : {}),
          host: region.host,
          ...(bodyStr ? { body: bodyStr } : {}),
        },
        {
          accessKeyId: this.creds.awsAccessKeyId,
          secretAccessKey: this.creds.awsSecretAccessKey,
        },
        { region: region.awsRegion, service: SP_API_SERVICE, datetime: amzDate() },
      );

      const fetchFn = this.opts.fetchImpl ?? fetch;
      const res = await withTimeout(
        fetchFn(url, {
          method,
          headers: {
            'x-amz-access-token': token,
            Authorization: signed.authorization,
            'x-amz-date': signed.xAmzDate,
            'Content-Type': 'application/json',
          },
          ...(bodyStr ? { body: bodyStr } : {}),
        }),
        timeoutMs,
      );

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) {
          throw new SpApiHttpError(res.status, await res.text());
        }
        const retryAfter = Number(res.headers.get('Retry-After') ?? '0');
        await this.sleep(Math.max(retryAfter * 1000, this.backoff(attempt, baseBackoffMs)));
        attempt++;
        continue;
      }

      if (!res.ok) {
        throw new SpApiHttpError(res.status, await res.text());
      }

      return await withTimeout(res.json(), timeoutMs);
    }
  }

  private backoff(attempt: number, baseMs: number): number {
    const exp = baseMs * Math.pow(2, attempt);
    return Math.round(exp + Math.random() * exp * 0.3);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export { extractPayload };
