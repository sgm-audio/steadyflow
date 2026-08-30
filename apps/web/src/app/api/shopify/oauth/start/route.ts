/**
 * GET /api/shopify/oauth/start?shop=<handle>.myshopify.com
 *
 * Kicks off the Shopify OAuth authorization-code flow for the shopify-admin
 * BYOK connection. See ../../../../../lib/shopify-oauth.ts for why OAuth
 * replaces the old shpat_ custom-app token.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { buildAuthorizeUrl, isValidShopDomain } from '../../../../../lib/shopify-oauth';
import { createClient } from '../../../../../lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.redirect(new URL('/login', request.url));

  const { searchParams, origin } = new URL(request.url);
  const shop = searchParams.get('shop') ?? '';
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'shop must be a *.myshopify.com domain' }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  const redirectUri = `${origin}/api/shopify/oauth/callback`;
  return NextResponse.redirect(buildAuthorizeUrl(shop, state, redirectUri));
}
