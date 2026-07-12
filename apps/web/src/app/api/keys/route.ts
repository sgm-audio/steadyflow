/**
 * POST /api/keys — Store a BYOK provider key.
 *
 * The raw provider key is sent here over the user's authenticated HTTPS
 * session (see /keys/[provider]/page.tsx) and encrypted server-side with
 * the pgsodium KEK — wrap_dek() in
 * supabase/migrations/20260109000006_dek_pgsodium_wrap.sql — before
 * persisting. It is never written to storage in plaintext.
 *
 * No client-side passphrase layer: this is a single-user personal
 * deployment, not a zero-knowledge multi-tenant product, so the server's
 * own KEK is a reasonable trust boundary. A prior version added a second,
 * passphrase-derived encryption layer in the browser — but the passphrase
 * never left the browser, which meant the background worker (which has no
 * passphrase) could never unwrap a key to actually call the provider API.
 * Every analysis silently fell back to the no-key heuristic path. Dropping
 * the passphrase layer fixes that and removes a "remember this forever or
 * lose the key" UX footgun.
 */

import { createClient } from '../../../lib/supabase-server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PROVIDERS = ['firecrawl', 'hunter', 'tavily', 'deepseek', 'nvidia-nim', 'groq', 'openai-compatible'] as const;

const KeysSetInput = z.object({
  provider: z.enum(PROVIDERS),
  rawKey: z.string().min(1),
});

const KeysDeleteInput = z.object({
  provider: z.enum(PROVIDERS),
});

/** Postgres bytea expects native \x<hex> text format, not base64. */
const textToBytea = (s: string): string => '\\x' + Buffer.from(s, 'utf8').toString('hex');

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = KeysSetInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const input = parsed.data;

  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
  const orgId = member?.org_id;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });

  const { data: wrappedKey, error: wrapError } = await supabase.rpc('wrap_dek', {
    p_dek: textToBytea(input.rawKey),
  });
  if (wrapError) return NextResponse.json({ error: `Failed to encrypt key: ${wrapError.message}` }, { status: 500 });

  const { error } = await supabase
    .from('keys_envelopes')
    .upsert({
      org_id: orgId,
      user_id: session.user.id,
      provider: input.provider,
      wrapped_key: wrappedKey,
      created_at: new Date().toISOString(),
    }, { onConflict: 'org_id, provider' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = KeysDeleteInput.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const input = parsed.data;

  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
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
