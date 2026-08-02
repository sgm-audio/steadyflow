/**
 * keys/list — List configured provider keys (metadata only, no secrets).
 *
 * GET /keys/list
 * Auth: required
 */
import {
  handleCors,
  createContext,
  ok,
  internalError,
} from '../_shared/context.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  const { data, error } = await ctx.supabase
    .from('keys_envelopes')
    .select('provider, created_at, rotated_at')
    .eq('org_id', ctx.orgId);

  if (error) return internalError(error.message);

  // Map DB rows (snake_case) to the camelCase keys.list contract shape.
  const items = (data ?? []).map((row) => ({
    provider: row.provider,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at ?? undefined,
  }));

  return ok(items);
});
