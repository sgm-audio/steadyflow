/**
 * POST /api/intents — Create a new analyze intent.
 * GET /api/intents — Redirect to intents page.
 */

import { createClient } from '../../../lib/supabase-server';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

export async function GET() {
  redirect('/intents');
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const platform = String(form.get('platform') ?? 'shopify');
  const url = String(form.get('url') ?? '');
  const idempotencyKey = String(form.get('idempotencyKey') ?? `web-${Date.now()}`);

  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  // Get org ID
  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
  const orgId = (member as { org_id?: string })?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });

  // Hash input
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ platform, url })));
  const inputHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Create intent
  const { data: intent, error } = await supabase
    .from('intents')
    .insert({
      org_id: orgId,
      user_id: session.user.id,
      kind: 'analyze_shop',
      status: 'queued',
      input_hash: inputHash,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Duplicate — redirect to existing
      const { data: existing } = await supabase.from('intents').select('id').eq('org_id', orgId).eq('idempotency_key', idempotencyKey).single();
      if (existing) return NextResponse.redirect(new URL(`/intents/${(existing as { id: string }).id}`, request.url));
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enqueue scrape
  await supabase.rpc('enqueue_message', {
    p_queue_name: 'q:scrape',
    p_message: {
      intentId: (intent as { id: string }).id,
      orgId, platform, url, requiresAuth: false,
    },
  });

  return NextResponse.redirect(new URL(`/intents/${(intent as { id: string }).id}`, request.url));
}
