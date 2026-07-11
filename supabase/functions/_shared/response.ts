/**
 * Response helpers for Edge Functions.
 *
 * Standardizes JSON responses, errors, and paginated lists.
 */

import { z } from 'npm:zod@3';
import type { SteadyFlowError } from './core-shim.ts';
import { error as sfError } from './core-shim.ts';

export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-request-id',
  'access-control-max-age': '86400',
};

export const json = <T>(data: T, init: ResponseInit = {}): Response => {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-request-id': crypto.randomUUID(),
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
};

export const jsonError = (e: SteadyFlowError, status: number): Response => {
  return json({ error: e }, { status });
};

export const ok = <T>(data: T): Response => json(data, { status: 200 });

export const created = <T>(data: T): Response => json(data, { status: 201 });

export const noContent = (): Response =>
  new Response(null, { status: 204, headers: corsHeaders });

export const badRequest = (message: string): Response =>
  jsonError(sfError('VALIDATION_FAILED', message), 400);

export const unauthorized = (): Response =>
  jsonError(sfError('UNAUTHENTICATED', 'Missing or invalid authentication'), 401);

export const forbidden = (): Response =>
  jsonError(sfError('FORBIDDEN', 'Insufficient permissions'), 403);

export const notFound = (resource: string): Response =>
  jsonError(sfError('NOT_FOUND', `${resource} not found`), 404);

export const rateLimited = (retryAfterSeconds: number): Response =>
  new Response(
    JSON.stringify({ error: sfError('RATE_LIMITED', 'Too many requests') }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(retryAfterSeconds),
        ...corsHeaders,
      },
    },
  );

export const internalError = (message: string): Response =>
  jsonError(sfError('INTERNAL', message), 500);

export const parseInput = <T>(
  schema: z.ZodType<T>,
  raw: unknown,
): { ok: true; value: T } | { ok: false; error: SteadyFlowError } => {
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    error: sfError('VALIDATION_FAILED', 'Input validation failed', {
      issues: r.error.issues,
    }),
  };
};

export const requireAuth = (
  req: Request,
): { userId: string; orgId: string } | Response => {
  const userId = req.headers.get('x-sb-user-id');
  const orgId = req.headers.get('x-sb-org-id');
  if (!userId || !orgId) return unauthorized();
  return { userId, orgId };
};

export const handleCors = (req: Request): Response | null => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
};
