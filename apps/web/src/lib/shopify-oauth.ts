/**
 * Shopify OAuth (authorization-code grant) helpers.
 *
 * Custom-app `shpat_` tokens generated directly from the Shopify admin UI
 * are retired — Shopify now requires the standard OAuth flow (Client ID +
 * Client Secret) even for single-store custom apps. The resulting access
 * token is used with `X-Shopify-Access-Token` exactly like the old shpat_
 * token was, so only how we obtain it changes.
 */
import crypto from 'node:crypto';

const getEnv = (key: string): string => {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required env var: ${key}. Set in apps/web/.env.local.`);
  }
  return val;
};

const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export const isValidShopDomain = (shop: string): boolean => SHOP_DOMAIN_RE.test(shop);

export const buildAuthorizeUrl = (shop: string, state: string, redirectUri: string): string => {
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set('client_id', getEnv('SHOPIFY_CLIENT_ID'));
  url.searchParams.set('scope', process.env.SHOPIFY_APP_SCOPES ?? 'read_products,read_inventory');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
};

/**
 * Verifies the callback's HMAC per Shopify's documented algorithm: sort all
 * query params except hmac/signature, join as key=value with &, HMAC-SHA256
 * with the client secret, compare hex digests in constant time.
 */
export const verifyHmac = (searchParams: URLSearchParams): boolean => {
  const hmac = searchParams.get('hmac');
  if (!hmac) return false;

  const message = [...searchParams.entries()]
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const digest = crypto
    .createHmac('sha256', getEnv('SHOPIFY_CLIENT_SECRET'))
    .update(message)
    .digest('hex');
  const digestBuf = Buffer.from(digest, 'utf8');
  const hmacBuf = Buffer.from(hmac, 'utf8');
  if (digestBuf.length !== hmacBuf.length) return false;
  return crypto.timingSafeEqual(digestBuf, hmacBuf);
};

interface TokenExchangeResult {
  accessToken: string;
  scope: string;
}

export const exchangeCodeForToken = async (
  shop: string,
  code: string,
): Promise<TokenExchangeResult> => {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: getEnv('SHOPIFY_CLIENT_ID'),
      client_secret: getEnv('SHOPIFY_CLIENT_SECRET'),
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { access_token?: string; scope?: string };
  if (!json.access_token) throw new Error('Shopify token exchange returned no access_token');
  return { accessToken: json.access_token, scope: json.scope ?? '' };
};
