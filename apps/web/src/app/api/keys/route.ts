/**
 * POST /api/keys — Store a BYOK provider key.
 * DELETE /api/keys — Remove a stored provider key.
 *
 * POST proxies to the keys.set Edge Function procedure (encrypts server-side
 * with the pgsodium KEK, writes an audit_log entry). There is no keys.delete
 * procedure in the contract yet, so DELETE still talks to Postgres directly.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiClient } from '../../../lib/api-client';
import { createClient } from '../../../lib/supabase-server';

const PROVIDERS = [
  'firecrawl',
  'tavily',
  'deepseek',
  'nvidia-nim',
  'groq',
  'openai-compatible',
  'shopify-admin',
  'printify',
  'amazon-sp-api',
  'alibaba',
] as const;

const KeysSetInput = z.object({
  provider: z.enum(PROVIDERS),
  rawKey: z.string().min(1),
});

const KeysDeleteInput = z.object({
  provider: z.enum(PROVIDERS),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = KeysSetInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const api = createApiClient(session.access_token);
  const result = await api.keysSet(parsed.data);

  if (!result.ok) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = KeysDeleteInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const input = parsed.data;

  const { data: member } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .single();
  const orgId = member?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });

  const { error } = await supabase
    .from('keys_envelopes')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', input.provider);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
