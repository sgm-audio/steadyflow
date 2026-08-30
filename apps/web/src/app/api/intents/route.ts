/**
 * POST /api/intents — Create a new analyze intent.
 * GET /api/intents — Redirect to intents page.
 *
 * Proxies to the intel.analyzeShop Edge Function procedure, which adds rate
 * limiting and audit logging that the previous hand-rolled insert+enqueue
 * here didn't have.
 */

import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiClient } from '../../../lib/api-client';
import { createClient } from '../../../lib/supabase-server';

export function GET() {
  redirect('/intents');
}

// Form fields must be actual strings, not File uploads.
const formString = (value: FormDataEntryValue | null, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

// Matches the intel-analyze-shop Edge Function's accepted platforms (a subset
// of the full @steadyflow/core Platform enum — woocommerce is experimental).
const SupportedPlatform = z.enum(['shopify', 'etsy', 'amazon']);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const platformParsed = SupportedPlatform.safeParse(formString(form.get('platform'), 'shopify'));
  const url = formString(form.get('url'), '');
  const idempotencyKey = formString(form.get('idempotencyKey'), `web-${Date.now()}`);

  if (!platformParsed.success)
    return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  const api = createApiClient(session.access_token);
  const result = await api.analyzeShop({
    platform: platformParsed.data,
    url,
    idempotencyKey,
    requiresAuth: false,
  });

  if (!result.ok) {
    const status =
      result.error.code === 'RATE_LIMITED'
        ? 429
        : result.error.code === 'VALIDATION_FAILED'
          ? 400
          : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.redirect(new URL(`/intents/${result.data.intentId}`, request.url));
}
