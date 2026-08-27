/**
 * Redact secrets from an object before hashing/logging.
 * Walks recursively, replacing values for keys that match secret patterns.
 */

const SECRET_KEY_PATTERNS = [
  /^api[_-]?key$/i,
  /^key$/i,
  /^token$/i,
  /^secret$/i,
  /^password$/i,
  /^pass$/i,
  /^authorization$/i,
  /^bearer$/i,
  /^cookie$/i,
  /^session[_-]?id$/i,
  /^private[_-]?key$/i,
];

const isSecretKey = (key: string): boolean => SECRET_KEY_PATTERNS.some((re) => re.test(key));

const REDACTED = '[REDACTED]';

export const redactSecrets = <T>(value: T): T => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const mapped: unknown[] = value.map((v: unknown) => redactSecrets(v));
    return mapped as T;
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSecretKey(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = redactSecrets(v);
    }
  }
  return out as T;
};
