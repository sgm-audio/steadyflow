/**
 * @steadyflow/crypto — client-side envelope encryption for BYOK provider keys.
 *
 * Two layers, both computed here (browser or Node, never on the server):
 *   1. A fresh random DEK (AES-256 key) encrypts the raw provider key
 *      (AES-256-GCM) -> wrappedKey/iv.
 *   2. A passphrase-derived key (Argon2id, RFC 9106) encrypts the DEK
 *      itself -> dekWrapped. The passphrase and the raw DEK never leave
 *      this module — only wrappedKey/iv/dekWrapped/dekSalt/kdfParams do.
 *
 * The server adds a third layer (pgsodium KEK) on top of dekWrapped before
 * persisting it — see wrap_dek()/unwrap_dek() in
 * supabase/migrations/20260109000006_dek_pgsodium_wrap.sql. That layer is
 * opaque to this module; from here, dekWrapped is just bytes to send.
 */

import { argon2idAsync } from '@noble/hashes/argon2.js';
import { z } from 'zod';

export const KdfParams = z.object({
  algo: z.literal('argon2id'),
  mem: z.number().int().positive(),
  t: z.number().int().positive(),
  p: z.number().int().positive(),
});
export type KdfParams = z.infer<typeof KdfParams>;

/** OWASP-recommended minimum for argon2id (2024 guidance): 19 MiB, 2 iterations. */
export const DEFAULT_KDF_PARAMS: KdfParams = { algo: 'argon2id', mem: 19456, t: 2, p: 1 };

export interface WrappedProviderKey {
  wrappedKey: string;
  iv: string;
  dekWrapped: string;
  dekSalt: string;
  kdfParams: KdfParams;
}

const AES_KEY_LEN = 32;
const GCM_IV_LEN = 12;
const DEK_SALT_LEN = 16;

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const concatBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

// `new Uint8Array(bytes)` copies into a fresh, genuine ArrayBuffer — TS 5.7+
// otherwise rejects Uint8Array<ArrayBufferLike> (e.g. from @noble/hashes or
// .slice()) as a Web Crypto BufferSource.
const toArrayBuffer = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

const deriveKey = async (passphrase: string, salt: Uint8Array, params: KdfParams): Promise<CryptoKey> => {
  const keyBytes = await argon2idAsync(passphrase, salt, {
    m: params.mem,
    t: params.t,
    p: params.p,
    dkLen: AES_KEY_LEN,
  });
  return crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['encrypt', 'decrypt']);
};

const aesGcmEncrypt = async (key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> => {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LEN));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(plaintext)));
  return concatBytes(iv, ciphertext);
};

const aesGcmDecrypt = async (key: CryptoKey, ivAndCiphertext: Uint8Array): Promise<Uint8Array> => {
  const iv = toArrayBuffer(ivAndCiphertext.slice(0, GCM_IV_LEN));
  const ciphertext = toArrayBuffer(ivAndCiphertext.slice(GCM_IV_LEN));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext));
};

/** Wrap a raw provider API key for storage. Never sends the passphrase or the raw DEK anywhere. */
export const wrapProviderKey = async (
  passphrase: string,
  rawProviderKey: string,
): Promise<WrappedProviderKey> => {
  const dek = crypto.getRandomValues(new Uint8Array(AES_KEY_LEN));
  const dekKey = await crypto.subtle.importKey('raw', dek, 'AES-GCM', false, ['encrypt']);
  const wrapped = await aesGcmEncrypt(dekKey, new TextEncoder().encode(rawProviderKey));
  const iv = wrapped.slice(0, GCM_IV_LEN);
  const wrappedKey = wrapped.slice(GCM_IV_LEN);

  const dekSalt = crypto.getRandomValues(new Uint8Array(DEK_SALT_LEN));
  const kdfParams = DEFAULT_KDF_PARAMS;
  const passphraseKey = await deriveKey(passphrase, dekSalt, kdfParams);
  const dekWrapped = await aesGcmEncrypt(passphraseKey, dek);

  return {
    wrappedKey: toBase64(wrappedKey),
    iv: toBase64(iv),
    dekWrapped: toBase64(dekWrapped),
    dekSalt: toBase64(dekSalt),
    kdfParams,
  };
};

/** Reverse of wrapProviderKey. Throws if the passphrase is wrong (AES-GCM auth tag fails). */
export const unwrapProviderKey = async (
  passphrase: string,
  envelope: WrappedProviderKey,
): Promise<string> => {
  const dekSalt = fromBase64(envelope.dekSalt);
  const passphraseKey = await deriveKey(passphrase, dekSalt, envelope.kdfParams);
  const dek = await aesGcmDecrypt(passphraseKey, fromBase64(envelope.dekWrapped));

  const dekKey = await crypto.subtle.importKey('raw', toArrayBuffer(dek), 'AES-GCM', false, ['decrypt']);
  const ivAndCiphertext = concatBytes(fromBase64(envelope.iv), fromBase64(envelope.wrappedKey));
  const raw = await aesGcmDecrypt(dekKey, ivAndCiphertext);
  return new TextDecoder().decode(raw);
};
