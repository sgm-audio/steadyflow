/**
 * pgsodium KEK envelope unwrap for BYOK proxy functions.
 *
 * Flow:
 *   1. Proxy function receives a request to call an external API.
 *   2. Looks up the org's wrapped provider key from keys_envelopes.
 *   3. Calls unwrapDek() to decrypt the DEK using the server KEK (pgsodium).
 *   4. Uses the DEK to AES-GCM decrypt the provider key.
 *   5. Calls the external API, then zeroes both the DEK and provider key.
 *
 * The server KEK is stored as a pgsodium key referenced by SUPABASE_KEK_ID.
 * This is a one-time setup: select pgsodium.create_key('steadyflow-kek').
 * The returned UUID goes into SUPABASE_KEK_ID env var.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const getEnv = (key: string, fallback: string): string => {
  try {
    const val = Deno.env.get(key);
    if (val) return val;
  } catch { /* not Deno */ }
  return fallback;
};

/**
 * Unwrap a DEK using the server KEK via pgsodium.
 * Returns the raw 32-byte DEK. Caller must zero after use.
 */
export const unwrapDek = async (
  supabase: ReturnType<typeof createClient>,
  dekWrapped: Uint8Array,
): Promise<Uint8Array> => {
  const kekId = getEnv('SUPABASE_KEK_ID', '');
  if (!kekId) throw new Error('SUPABASE_KEK_ID not set');

  const { data, error } = await supabase.rpc('pgsodium.crypto_aead_det_decrypt', {
    message: dekWrapped,
    additional_data: null,
    key_id: kekId,
    nonce: null,
  });

  if (error) throw new Error(`pgsodium DEK unwrap failed: ${error.message}`);
  const raw = (data as { decrypted: string })?.decrypted;
  if (!raw) throw new Error('pgsodium DEK unwrap returned empty result');

  // pgsodium returns base64-encoded ciphertext.
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error(`DEK must be 32 bytes, got ${bytes.length}`);
  return bytes;
};

/**
 * AES-GCM decrypt a provider key using the unwrapped DEK.
 */
export const decryptProviderKey = async (
  dek: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> => {
  if (dek.length !== 32) throw new Error('DEK must be 32 bytes');
  if (iv.length !== 12) throw new Error('IV must be 12 bytes');

  const key = await crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(pt);
};

/**
 * Zero a buffer in place. Call after every use of plaintext keys.
 */
export const zeroBuffer = (buf: Uint8Array): void => {
  buf.fill(0);
};

/**
 * Convenience: unwrap DEK, decrypt provider key, pass it to fn, zero everything.
 * This is the primary API for proxy functions.
 */
export const withProviderKey = async <T>(
  supabase: ReturnType<typeof createClient>,
  dekWrapped: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  fn: (key: string) => Promise<T>,
): Promise<T> => {
  const dek = await unwrapDek(supabase, dekWrapped);
  try {
    const keyBytes = await decryptProviderKey(dek, ciphertext, iv);
    const keyStr = new TextDecoder().decode(keyBytes);
    try {
      return await fn(keyStr);
    } finally {
      zeroBuffer(keyBytes);
    }
  } finally {
    zeroBuffer(dek);
  }
};
