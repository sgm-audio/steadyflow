/**
 * Edge Function request context.
 *
 * Import this in every BFF function to get typed request handling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAnonClient } from './supabase.ts';

export { json, jsonError, ok, created, noContent, badRequest, unauthorized, forbidden, notFound, rateLimited, internalError, parseInput, requireAuth, handleCors } from './response.ts';
export { createServiceRoleClient } from './supabase.ts';
export { writeAudit } from './audit.ts';
export { checkRateLimit } from './rateLimit.ts';
export { enqueue, dequeue, archive } from './queue.ts';
export { withProviderKey, zeroBuffer } from './envelope.ts';
export type { QueueName } from './queue.ts';

export interface EdgeContext {
  req: Request;
  supabase: SupabaseClient;
  userId: string;
  orgId: string;
  requestId: string;
}

let _cachedSupabase: SupabaseClient | undefined;

const getAnonClient = (): SupabaseClient => {
  if (!_cachedSupabase) {
    _cachedSupabase = createAnonClient();
  }
  return _cachedSupabase;
};

/**
 * Initialize request context for a BFF function.
 *
 * Auth flow:
 *   1. Supabase gateway validates the JWT and injects x-sb-user-id header.
 *   2. We look up the user's org from memberships (or from x-sb-org-id if passed).
 *
 * Returns a 401 Response if auth is missing.
 */
export const createContext = async (req: Request): Promise<EdgeContext | Response> => {
  const userId = req.headers.get('x-sb-user-id');
  if (!userId) {
    return new Response(
      JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Missing auth context' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  const supabase = getAnonClient();
  let orgId = req.headers.get('x-sb-org-id') ?? '';

  // If orgId not in headers, look it up from memberships
  if (!orgId) {
    const { data, error } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No org found for user' } }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }
    orgId = (data as { org_id: string }).org_id;
  }

  return {
    req,
    supabase,
    userId,
    orgId,
    requestId: req.headers.get('x-request-id') ?? crypto.randomUUID(),
  };
};
