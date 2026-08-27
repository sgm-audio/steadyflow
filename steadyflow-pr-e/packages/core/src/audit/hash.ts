import { createHash, type BinaryLike } from 'node:crypto';

/**
 * SHA-256 of a redacted input. Used as the `input_hash` in audit logs.
 * Always hex-encoded, lowercase, 64 chars.
 */
export const computeInputHash = (input: BinaryLike): string => {
  return createHash('sha256').update(input).digest('hex');
};

/**
 * Stable JSON serialization with sorted keys.
 * Ensures the same logical input always produces the same hash.
 */
export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
};

export const hashObject = (value: unknown): string => computeInputHash(stableStringify(value));
