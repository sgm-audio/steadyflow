/**
 * audit/query — Paginated audit log for the calling org.
 *
 * GET /audit/query?action=intent.create&outcome=success&limit=50&cursor=...
 * Auth: required
 */

import { z } from 'npm:zod@3';
import {
  handleCors, createContext, ok, badRequest,
} from '../_shared/context.ts';

const QueryInput = z.object({
  action: z.string().optional(),
  outcome: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
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

  const parsed = QueryInput.safeParse(raw);
  if (!parsed.success) return badRequest('Invalid parameters');

  const { action, outcome, limit, cursor } = parsed.data;

  let query = ctx.supabase
    .from('audit_log')
    .select('id, org_id, user_id, action, outcome, input_hash, provider, duration_ms, error_code, idempotency_key, metadata, created_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (action) query = query.eq('action', action);
  if (outcome) query = query.eq('outcome', outcome);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: error.message } }), { status: 500, headers: { 'content-type': 'application/json' } });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.created_at : undefined;

  // Map DB rows (snake_case) to the camelCase AuditEvent contract shape.
  const items = page.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    action: row.action,
    outcome: row.outcome,
    inputHash: row.input_hash,
    provider: row.provider ?? undefined,
    durationMs: row.duration_ms,
    errorCode: row.error_code ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));

  return ok({ items, nextCursor });
});
