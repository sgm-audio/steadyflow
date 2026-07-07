/**
 * pgsodium KEK envelope unwrap.
 *
 * Placeholder. Implementation lands in Phase 2.
 *
 * The real implementation will:
 *   1. Receive a wrapped DEK (bytea) and a KEK ID (from env).
 *   2. Call pgsodium.crypto_aead_det_decrypt() to unwrap the DEK.
 *   3. Return the DEK as Uint8Array for use in AES-GCM operations.
 *   4. Zero the DEK buffer after use via zeroBuffer().
 */

export const PLACEHOLDER = true;
