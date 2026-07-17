/**
 * Token-safe error formatter.
 * Strips Authorization headers and other sensitive fields from any object
 * before logging or stringifying.
 */

const REDACT_KEYS = new Set([
  'authorization',
  'x-shopify-access-token',
  'shopify-access-token',
  'token',
  'access_token',
  'api-key',
  'apikey',
  'password',
  'secret',
]);

const REDACTED = '[REDACTED]';

export function redact<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => redact(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = redact(v);
    }
  }
  return out as T;
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(redact(value), null, 2);
  } catch {
    return '[unserializable]';
  }
}

export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}
