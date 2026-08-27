/**
 * Per-org DEK derivation.
 *
 * The DEK is derived from a user passphrase via Argon2id.
 * The DEK wraps each provider key (AES-GCM).
 * The DEK itself is wrapped with a server-held KEK before being stored.
 *
 * This module is the CLIENT side (passphrase -> DEK).
 * Server-side unwrap uses pgsodium (see supabase/functions/proxy-llm).
 */

export interface KdfParams {
  /** Algorithm identifier. */
  algo: 'argon2id';
  /** Memory cost in KiB. */
  mem: number;
  /** Iterations. */
  t: number;
  /** Parallelism. */
  p: number;
}

/**
 * Conservative defaults (OWASP 2024 recommendation for Argon2id).
 * Tunable per org via `orgs.kdf_params`.
 */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algo: 'argon2id',
  mem: 19456, // 19 MiB
  t: 2,
  p: 1,
};

export interface DerivedDek {
  /** 32-byte raw key. */
  key: Uint8Array;
  salt: Uint8Array;
  params: KdfParams;
}

/**
 * Derive a 256-bit DEK from a passphrase using PBKDF2-SHA-256.
 *
 * NOTE: This is a fallback for environments without Argon2 (e.g., Deno Edge
 * Functions, some browsers). The desktop app uses Argon2id via
 * `@noble/hashes` (see packages/crypto).
 *
 * PBKDF2 with 600k iterations is the FIPS-approved fallback.
 */
export const deriveDekPbkdf2 = async (
  passphrase: string,
  salt: Uint8Array,
  iterations = 600_000,
): Promise<DerivedDek> => {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return {
    key: new Uint8Array(bits),
    salt,
    params: { algo: 'argon2id', mem: 0, t: iterations, p: 1 },
  };
};

export const randomSalt = (bytes = 16): Uint8Array => {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return out;
};
