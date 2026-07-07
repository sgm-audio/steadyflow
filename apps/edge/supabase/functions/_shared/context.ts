// Supabase Edge Function entrypoint conventions for SteadyFlow.
// Every function:
//   1. Verifies the JWT (handled by the gateway when verify_jwt = true).
//   2. Validates input via Zod.
//   3. Enforces rate limit.
//   4. Writes to audit_log.
//   5. Returns a typed response.

import { z } from 'zod';
import type { SteadyFlowError } from '@steadyflow/core';
import { error as sfError } from '@steadyflow/core';

export interface EdgeContext {
  request: Request;
  userId: string;
  orgId: string;
  requestId: string;
}

export const json = <T>(data: T, init: ResponseInit = {}): Response => {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-request-id': crypto.randomUUID(),
      ...(init.headers ?? {}),
    },
  });
};

export const jsonError = (e: SteadyFlowError, status: number): Response => {
  return json({ error: e }, { status });
};

export const parseInput = <T>(schema: z.ZodType<T>, raw: unknown): { ok: true; value: T } | { ok: false; error: SteadyFlowError } => {
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    error: sfError('VALIDATION_FAILED', 'Input validation failed', { issues: r.error.issues }),
  };
};

export const requireAuth = (req: Request): { userId: string; orgId: string } | Response => {
  // The Supabase gateway injects these headers when verify_jwt = true.
  const userId = req.headers.get('x-sb-user-id');
  const orgId = req.headers.get('x-sb-org-id');
  if (!userId || !orgId) {
    return jsonError(sfError('UNAUTHENTICATED', 'Missing auth context'), 401);
  }
  return { userId, orgId };
};

export const withRequestId = (headers: Headers): string => {
  const id = headers.get('x-request-id') ?? crypto.randomUUID();
  return id;
};
