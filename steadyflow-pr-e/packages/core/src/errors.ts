import { z } from 'zod';

/**
 * Stable, machine-readable error codes.
 * Every error returned to a client MUST include one of these.
 */
export const ErrorCode = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'PROVIDER_UNAVAILABLE',
  'KEY_MISSING',
  'KEY_INVALID',
  'ENVELOPE_DECRYPT_FAILED',
  'INTERNAL',
  'TIMEOUT',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const SteadyFlowError = z.object({
  code: ErrorCode,
  message: z.string().min(1).max(2000),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().uuid().optional(),
});
export type SteadyFlowError = z.infer<typeof SteadyFlowError>;

export const error = (code: ErrorCode, message: string, details?: Record<string, unknown>): SteadyFlowError => {
  const base: { code: ErrorCode; message: string; details?: Record<string, unknown> } = { code, message };
  if (details !== undefined) base.details = details;
  return base;
};
