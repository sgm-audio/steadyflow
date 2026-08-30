/**
 * insights/list — Paginated insights for the calling org.
 *
 * GET /insights/list?category=pricing&limit=20&cursor=...
 * Auth: required
 */

import { z } from 'npm:zod@3';
import { badRequest, createContext, handleCors, ok } from '../_shared/context.ts';

const ListInput = z.object({
  category: z
    .enum([
      'pricing',
      'positioning',
      'product_mix',
      'marketing',
      'seo',
      'conversion',
      'inventory',
      'trend',
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams);

  const parsed = ListInput.safeParse(raw);
  if (!parsed.success) return badRequest('Invalid parameters');

  const { category, limit, cursor } = parsed.data;

  let query = ctx.supabase
    .from('insights')
    .select('id, category, severity, title, body, citations, model, provider, generated_at')
    .eq('org_id', ctx.orgId)
    .order('generated_at', { ascending: false })
    .limit(limit + 1);

  if (category) query = query.eq('category', category);
  if (cursor) query = query.lt('generated_at', cursor);

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: error.message } }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.generated_at : undefined;

  // Map DB rows (snake_case) to the camelCase Insight contract shape.
  const items = page.map((row) => ({
    id: row.id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    body: row.body,
    citations: row.citations ?? [],
    model: row.model,
    provider: row.provider,
    generatedAt: row.generated_at,
  }));

  return ok({ items, nextCursor });
});
