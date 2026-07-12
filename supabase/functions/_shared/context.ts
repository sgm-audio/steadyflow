/**
 * Edge Function request context.
 *
 * Import this in every BFF function to get typed request handling.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createServiceRoleClient } from './supabase.ts';

export { json, jsonError, ok, created, noContent, badRequest, unauthorized, forbidden, notFound, rateLimited, internalError, parseInput, handleCors } from './response.ts';
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

/**
 * Decode the JWT payload to extract the sub claim (user ID).
 * The gateway has already verified the JWT signature, so we trust the payload.
 */
const parseUserIdFromJwt = (req: Request): string | null => {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const token = auth.slice(7);
    const payload = token.split('.')[1];
    if (!payload) return null;
    // Decode base64url JSON payload
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json.sub ?? null;
  } catch {
    return null;
  }
};

/**
 * Initialize request context for a BFF function.
 *
 * Auth flow:
 *   1. Supabase gateway validates the JWT and injects x-sb-user-id header.
 *   2. Fallback: parse user ID from the JWT directly (local dev).
 *   3. Look up the user's org from memberships.
 *
 * orgId is always resolved server-side from memberships, never trusted from
 * a request header -- a client-supplied org id would let any authenticated
 * user read/write another org's data against the service-role client.
 *
 * Returns a 401 Response if auth is missing.
 */
export const createContext = async (req: Request): Promise<EdgeContext | Response> => {
  const userId = req.headers.get('x-sb-user-id') ?? parseUserIdFromJwt(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Missing auth context' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }

  // Use service-role client. All queries scope by the org_id resolved below,
  // so RLS isn't required.
  const supabase = createServiceRoleClient();

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

  return {
    req,
    supabase,
    userId,
    orgId: (data as { org_id: string }).org_id,
    requestId: req.headers.get('x-request-id') ?? crypto.randomUUID(),
  };
};
