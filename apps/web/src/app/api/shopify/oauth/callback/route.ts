/**
 * GET /api/shopify/oauth/callback — Shopify OAuth redirect target.
 *
 * Verifies state + HMAC, exchanges the authorization code for an access
 * token, and stores it in the existing BYOK vault under provider
 * 'shopify-admin' — same wrap_dek/keys_envelopes path as POST /api/keys,
 * just sourced from OAuth instead of a pasted key.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase-server';
import { exchangeCodeForToken, isValidShopDomain, verifyHmac } from '../../../../../lib/shopify-oauth';

/** Postgres bytea expects native \x<hex> text format, not base64. */
const textToBytea = (s: string): string => '\\x' + Buffer.from(s, 'utf8').toString('hex');

const failure = (request: Request, reason: string): NextResponse =>
  NextResponse.redirect(new URL(`/keys/shopify-admin?error=${reason}`, request.url));

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.redirect(new URL('/login', request.url));

  const { searchParams } = new URL(request.url);
  const shop = searchParams.get('shop') ?? '';
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('shopify_oauth_state')?.value;
  cookieStore.delete('shopify_oauth_state');

  if (!isValidShopDomain(shop) || !code || !state || !expectedState || state !== expectedState) {
    return failure(request, 'invalid_state');
  }
  if (!verifyHmac(searchParams)) return failure(request, 'invalid_hmac');

  let accessToken: string;
  try {
    ({ accessToken } = await exchangeCodeForToken(shop, code));
  } catch {
    return failure(request, 'token_exchange_failed');
  }

  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
  const orgId = member?.org_id;
  if (!orgId) return failure(request, 'no_org');

  const { data: wrappedKey, error: wrapError } = await supabase.rpc('wrap_dek', {
    p_dek: textToBytea(accessToken),
  });
  if (wrapError) return failure(request, 'encrypt_failed');

  const { error: upsertError } = await supabase
    .from('keys_envelopes')
    .upsert({
      org_id: orgId,
      user_id: session.user.id,
      provider: 'shopify-admin',
      wrapped_key: wrappedKey,
      created_at: new Date().toISOString(),
    }, { onConflict: 'org_id, provider' });
  if (upsertError) return failure(request, 'store_failed');

  await supabase.from('orgs').update({ shopify_store_url: `https://${shop}` }).eq('id', orgId);

  return NextResponse.redirect(new URL('/keys?connected=shopify-admin', request.url));
}
