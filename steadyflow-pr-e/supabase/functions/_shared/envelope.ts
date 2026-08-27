/**
 * Provider key unwrap for BYOK proxy functions.
 *
 * Flow:
 *   1. Proxy function receives a request to call an external API.
 *   2. Looks up the org's wrapped provider key from keys_envelopes.
 *   3. Calls unwrap_dek() (Postgres RPC) to decrypt it via the server's
 *      pgsodium KEK. wrapped_key = wrap_dek(raw_provider_key) -- one layer,
 *      no client-side passphrase (see 20260710000001_keys_envelopes_drop_passphrase_layer.sql).
 *   4. Calls the external API with the decrypted key.
 *
 * The server KEK is a pgsodium key named 'steadyflow-kek' (see
 * supabase/scripts/setup-kek.sql); wrap_dek/unwrap_dek reference it directly,
 * no env var needed.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const hexToBytes = (hex: string): Uint8Array =>
  new Uint8Array((hex.replace(/^\\x/, '').match(/.{1,2}/g) ?? []).map((b) => Number.parseInt(b, 16)));

/**
 * Unwrap the provider key stored for (orgId, provider).
 * Returns null if no key is configured or the unwrap RPC fails.
 */
export const unwrapProviderKey = async (
  supabase: SupabaseClient,
  orgId: string,
  provider: string,
): Promise<string | null> => {
  const { data: env, error: envErr } = await supabase
    .from('keys_envelopes')
    .select('wrapped_key')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .single();
  if (envErr || !env) return null;

  const { data: raw, error: unwrapErr } = await supabase
    .rpc('unwrap_dek', { p_wrapped: (env as { wrapped_key: string }).wrapped_key })
    .single();
  if (unwrapErr || !raw) return null;

  const bytes = hexToBytes(typeof raw === 'string' ? raw : String(raw));
  return new TextDecoder().decode(bytes);
};

/**
 * Zero a buffer in place. Call after every use of plaintext key bytes.
 */
export const zeroBuffer = (buf: Uint8Array): void => {
  buf.fill(0);
};
