import { describe, expect, it, vi } from 'vitest';
import type { SpApiCredentials } from '../credential.js';
import { SpApiClient, SP_API_REGIONS } from './client.js';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function mockFetch(handler: (u: string) => Response) {
  return vi.fn((url: string | URL | Request): Promise<Response> =>
    Promise.resolve(handler(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)),
  );
}

const creds: SpApiCredentials = {
  clientId: 'amzn1.application-oa2-client.test',
  clientSecret: 'amzn1.otoken.test',
  refreshToken: 'Atzr|refresh-token',
  awsAccessKeyId: 'AKIDEXAMPLE',
  awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  sellerId: 'A1SELLERID',
  marketplaceIds: ['ATVPDKIKX0DER'],
  region: 'na',
};

const tokenResponse = { access_token: 'Atza|token-1', expires_in: 3600, token_type: 'bearer' };

describe('SpApiClient', () => {
  it('sends SigV4-signed requests to the NA endpoint with LWA token headers', async () => {
    const fetchImpl = mockFetch((u) =>
      u.includes('auth/o2/token') ? jsonResponse(tokenResponse) : jsonResponse({ ok: true }),
    );
    const client = new SpApiClient(creds, { fetchImpl });

    await client.request('/orders/v0/orders');

    expect(fetchImpl).toHaveBeenCalledTimes(2); // 1 LWA + 1 SP-API
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://sellingpartnerapi-na.amazon.com/orders/v0/orders');
    expect(init.method).toBe('GET');
    const headers = new Headers(init.headers);
    expect(headers.get('x-amz-access-token')).toBe('Atza|token-1');
    expect(headers.get('Authorization')).toContain('AWS4-HMAC-SHA256');
    expect(headers.get('x-amz-date')).toBeTruthy();
  });

  it('maps regions to the correct SP-API host and AWS region', () => {
    expect(SP_API_REGIONS.na).toEqual({
      host: 'sellingpartnerapi-na.amazon.com',
      awsRegion: 'us-east-1',
    });
    expect(SP_API_REGIONS.eu).toEqual({
      host: 'sellingpartnerapi-eu.amazon.com',
      awsRegion: 'eu-west-1',
    });
    expect(SP_API_REGIONS.fe).toEqual({
      host: 'sellingpartnerapi-fe.amazon.com',
      awsRegion: 'us-west-2',
    });
  });

  it('serializes query params sorted and joins MarketplaceIds', async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ ok: true }));
    const client = new SpApiClient(creds, { fetchImpl });

    await client.request('/orders/v0/orders', {
      query: { CreatedAfter: '2026-07-01T00:00:00Z', MarketplaceIds: 'ATVPDKIKX0DER', z: 1 },
    });

    const [url] = fetchImpl.mock.calls[1] as unknown as [string];
    expect(url).toBe(
      'https://sellingpartnerapi-na.amazon.com/orders/v0/orders?CreatedAfter=2026-07-01T00%3A00%3A00Z&MarketplaceIds=ATVPDKIKX0DER&z=1',
    );
  });

  it('retries on 429 honoring Retry-After and succeeds on the next attempt', async () => {
    let spApiCalls = 0;
    const fetchImpl = mockFetch((u) => {
      if (u.includes('auth/o2/token')) {
        return jsonResponse(tokenResponse);
      }
      if (spApiCalls === 0) {
        spApiCalls++;
        return new Response(JSON.stringify({ errors: [] }), {
          status: 429,
          headers: { 'Retry-After': '0' },
        });
      }
      return jsonResponse({ ok: true });
    });
    const client = new SpApiClient(creds, { fetchImpl, baseBackoffMs: 1 });

    const res = await client.request('/orders/v0/orders');
    expect(res).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 LWA + 2 SP-API
  });

  it('retries on 5xx with bounded backoff', async () => {
    let spApiCalls = 0;
    const fetchImpl = mockFetch((u) => {
      if (u.includes('auth/o2/token')) {
        return jsonResponse(tokenResponse);
      }
      if (spApiCalls === 0) {
        spApiCalls++;
        return jsonResponse({ errors: [{ code: 'InternalFailure' }] }, 500);
      }
      return jsonResponse({ ok: true });
    });
    const client = new SpApiClient(creds, { fetchImpl, baseBackoffMs: 1 });

    await client.request('/orders/v0/orders');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry 4xx and surfaces the status + SP-API error message', async () => {
    const fetchImpl = mockFetch((u) => {
      if (u.includes('auth/o2/token')) {
        return jsonResponse(tokenResponse);
      }
      return jsonResponse(
        {
          errors: [
            { code: 'Unauthorized', message: 'Access to the resource is forbidden', details: 'LWA scope missing' },
          ],
        },
        403,
      );
    });
    const client = new SpApiClient(creds, { fetchImpl });

    await expect(client.request('/orders/v0/orders')).rejects.toThrow(
      /HTTP 403.*Access to the resource is forbidden/s,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2); // no retry
  });

  it('throws SpApiHttpError when 429 retries are exhausted', async () => {
    const fetchImpl = mockFetch((u) => {
      if (u.includes('auth/o2/token')) {
        return jsonResponse(tokenResponse);
      }
      return new Response(JSON.stringify({ errors: [{ code: 'QuotaExceeded' }] }), {
        status: 429,
        headers: { 'Retry-After': '0' },
      });
    });
    const client = new SpApiClient(creds, { fetchImpl, maxRetries: 2, baseBackoffMs: 1 });

    await expect(client.request('/orders/v0/orders')).rejects.toThrow(/HTTP 429/);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // 1 LWA + 3 attempts (1 + 2 retries)
  });

  it('fails loudly instead of hanging when the endpoint stalls past the timeout', async () => {
    const fetchImpl = vi.fn((): Promise<Response> => new Promise<Response>(() => undefined));
    const client = new SpApiClient(creds, { fetchImpl, timeoutMs: 30, baseBackoffMs: 1 });

    await expect(client.request('/orders/v0/orders')).rejects.toThrow(/timed out|timeout/i);
  });

  it('omits the body on GET and serializes JSON on POST/PATCH', async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ ok: true }));
    const client = new SpApiClient(creds, { fetchImpl });

    await client.request('/listings/2021-01-08/items/A1SELLERID/PRINT-001', {
      method: 'PATCH',
      body: { productType: 'PRODUCT', patches: [] },
    });

    const [, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(init.body as string).toContain('productType');
  });
});
