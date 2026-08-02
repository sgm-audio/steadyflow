/**
 * intel/list — Paginated intents for the calling org.
 *
 * GET /intel/list?kind=analyze_shop&status=succeeded&limit=20&cursor=...
 * Auth: required
 */

import { z } from 'npm:zod@3';
import {
  handleCors, createContext, ok, badRequest,
} from '../_shared/context.ts';

const ListInput = z.object({
  kind: z.enum(['analyze_shop', 'analyze_product', 'enrich_contact', 'monitor_competitor']).optional(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'rate_limited']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams);

  const parsed = ListInput.safeParse(raw);
  if (!parsed.success) return badRequest('Invalid parameters');

  const { kind, status, limit, cursor } = parsed.data;

  let query = ctx.supabase
    .from('intents')
    .select('id, kind, status, input_hash, created_at, updated_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (kind) query = query.eq('kind', kind);
  if (status) query = query.eq('status', status);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: error.message } }), { status: 500, headers: { 'content-type': 'application/json' } });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.created_at : undefined;

  // Map DB rows (snake_case) to the camelCase intent.list contract shape.
  const items = page.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    inputHash: row.input_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return ok({ items, nextCursor });
});
