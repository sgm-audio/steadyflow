import { zeroBuffer } from './zero.js';

/**
 * AES-GCM envelope encryption.
 *
 * Wraps a provider key (or any secret) with a DEK.
 * Output is a self-contained envelope: { ciphertext, iv }.
 *
 * Compatible with WebCrypto (browsers, Deno, Node 20+).
 */

export interface Envelope {
  /** AES-GCM ciphertext (includes auth tag). */
  ciphertext: Uint8Array;
  /** 12-byte IV. */
  iv: Uint8Array;
}

const IV_BYTES = 12;

export const wrapKey = async (dek: Uint8Array, plaintext: Uint8Array): Promise<Envelope> => {
  if (dek.length !== 32) throw new Error('DEK must be 32 bytes (256-bit)');
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);

  const cryptoKey = await crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext);
  return { ciphertext: new Uint8Array(ct), iv };
};

export const unwrapKey = async (dek: Uint8Array, env: Envelope): Promise<Uint8Array> => {
  if (dek.length !== 32) throw new Error('DEK must be 32 bytes (256-bit)');
  if (env.iv.length !== IV_BYTES) throw new Error('IV must be 12 bytes');
  const cryptoKey = await crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: env.iv }, cryptoKey, env.ciphertext);
  return new Uint8Array(pt);
};

/**
 * Convenience: wrap a UTF-8 string (e.g., an API key).
 * Caller is responsible for zeroing the returned plaintext after use.
 */
export const wrapString = async (dek: Uint8Array, plaintext: string): Promise<Envelope> => {
  const enc = new TextEncoder();
  return wrapKey(dek, enc.encode(plaintext));
};

export const unwrapString = async (dek: Uint8Array, env: Envelope): Promise<string> => {
  const pt = await unwrapKey(dek, env);
  const dec = new TextDecoder();
  return dec.decode(pt);
};

/**
 * Wrap, use, zero. Helper for the common pattern of unwrapping a key,
 * using it once, and zeroing the buffer.
 */
export const withUnwrappedKey = async <T>(
  dek: Uint8Array,
  env: Envelope,
  fn: (key: Uint8Array) => Promise<T>,
): Promise<T> => {
  const pt = await unwrapKey(dek, env);
  try {
    return await fn(pt);
  } finally {
    zeroBuffer(pt);
  }
};
