import { describe, expect, it, vi } from 'vitest';
import { LwaClient } from './lwa.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const opts = {
  clientId: 'amzn1.application-oa2-client.test',
  clientSecret: 'amzn1.otoken.test',
  refreshToken: 'Atzr|refresh-token',
};

describe('LwaClient', () => {
  it('exchanges a refresh token for an access token via the LWA endpoint', async () => {
    const fetchImpl = vi.fn(
      (): Promise<Response> =>
        Promise.resolve(
          jsonResponse({ access_token: 'Atza|token-1', expires_in: 3600, token_type: 'bearer' }),
        ),
    );
    const lwa = new LwaClient({ ...opts, fetchImpl });

    const token = await lwa.getAccessToken();

    expect(token).toBe('Atza|token-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.amazon.com/auth/o2/token');
    const body = init.body as string;
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=Atzr%7Crefresh-token');
    expect(body).toContain('client_id=amzn1.application-oa2-client.test');
  });

  it('caches the access token until near expiry (one fetch for two calls)', async () => {
    const fetchImpl = vi.fn(
      (): Promise<Response> =>
        Promise.resolve(
          jsonResponse({ access_token: 'Atza|token-1', expires_in: 3600, token_type: 'bearer' }),
        ),
    );
    const lwa = new LwaClient({ ...opts, fetchImpl });

    await lwa.getAccessToken();
    await lwa.getAccessToken();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when the cached token is within the 60s refresh window', async () => {
    const fetchImpl = vi.fn(
      (): Promise<Response> =>
        Promise.resolve(
          jsonResponse({ access_token: 'Atza|token-short', expires_in: 30, token_type: 'bearer' }),
        ),
    );
    const lwa = new LwaClient({ ...opts, fetchImpl });

    await lwa.getAccessToken();
    await lwa.getAccessToken();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps non-200 LWA responses to a descriptive error', async () => {
    const fetchImpl = vi.fn(
      (): Promise<Response> =>
        Promise.resolve(
          jsonResponse(
            { error: 'invalid_grant', error_description: 'The refresh token is invalid' },
            400,
          ),
        ),
    );
    const lwa = new LwaClient({ ...opts, fetchImpl });

    await expect(lwa.getAccessToken()).rejects.toThrow(/invalid_grant/);
  });

  it('rejects with AmazonTimeoutError instead of hanging when LWA never responds', async () => {
    const fetchImpl = vi.fn((): Promise<Response> => new Promise<Response>(() => undefined));
    const lwa = new LwaClient({ ...opts, fetchImpl, timeoutMs: 30 });

    await expect(lwa.getAccessToken()).rejects.toThrow(/timed out|timeout/i);
  });
});
