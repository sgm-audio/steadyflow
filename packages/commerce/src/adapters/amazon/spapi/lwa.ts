import { AmazonTimeoutError, DEFAULT_HTTP_TIMEOUT_MS, withTimeout } from './http.js';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
/** Refresh the cached access token when less than this remains. */
const REFRESH_WINDOW_MS = 60_000;

export interface LwaClientOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface LwaTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Login with Amazon (LWA) client — exchanges the SP-API refresh token for
 * short-lived access tokens, cached until 60s before expiry.
 */
export class LwaClient {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(private readonly opts: LwaClientOptions) {}

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - REFRESH_WINDOW_MS > Date.now()) {
      return this.cached.token;
    }

    const fetchFn = this.opts.fetchImpl ?? fetch;
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.opts.refreshToken,
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
    }).toString();

    const res = await withTimeout(
      fetchFn(LWA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
      timeoutMs,
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[commerce/amazon] LWA token exchange failed HTTP ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    const parsed = (await withTimeout(res.json(), timeoutMs)) as LwaTokenResponse;
    this.cached = {
      token: parsed.access_token,
      expiresAt: Date.now() + parsed.expires_in * 1000,
    };
    return this.cached.token;
  }
}

export { AmazonTimeoutError };
