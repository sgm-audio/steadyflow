/**
 * POST /api/keys — Store a BYOK provider key envelope.
 *
 * The client (see /keys/[provider]/page.tsx) has already wrapped the raw
 * provider key with a random DEK, and wrapped that DEK with a
 * passphrase-derived key (Argon2id) — see @steadyflow/crypto. Neither the
 * raw provider key, the raw DEK, nor the passphrase ever reach this route.
 *
 * This adds one more layer on the DEK (pgsodium, server KEK — see
 * wrap_dek() in supabase/migrations/20260109000006_dek_pgsodium_wrap.sql)
 * before persisting.
 */

import { createClient } from '../../../lib/supabase-server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PROVIDERS = ['firecrawl', 'hunter', 'tavily', 'deepseek', 'nvidia-nim', 'groq', 'openai-compatible'] as const;

const KeysSetInput = z.object({
  provider: z.enum(PROVIDERS),
  wrappedKey: z.string().min(1),
  iv: z.string().min(1),
  dekWrapped: z.string().min(1),
  dekSalt: z.string().min(1),
  kdfParams: z.object({
    algo: z.literal('argon2id'),
    mem: z.number().int().positive(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
  }),
});

/** PostgREST/pgsodium expect bytea input as Postgres's native \x<hex> text format, not base64. */
const base64ToBytea = (b64: string): string => '\\x' + Buffer.from(b64, 'base64').toString('hex');

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

  const { data: dekWrappedByKek, error: wrapError } = await supabase.rpc('wrap_dek', {
    p_dek: base64ToBytea(input.dekWrapped),
  });
  if (wrapError) return NextResponse.json({ error: `Failed to wrap key: ${wrapError.message}` }, { status: 500 });

  const { error } = await supabase
    .from('keys_envelopes')
    .upsert({
      org_id: orgId,
      user_id: session.user.id,
      provider: input.provider,
      wrapped_key: base64ToBytea(input.wrappedKey),
      iv: base64ToBytea(input.iv),
      dek_wrapped: dekWrappedByKek,
      dek_salt: base64ToBytea(input.dekSalt),
      kdf_params: input.kdfParams,
      created_at: new Date().toISOString(),
    }, { onConflict: 'org_id, provider' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
