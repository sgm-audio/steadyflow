/**
 * org/llm-config/get — Get the org's default LLM configuration.
 *
 * GET /org/llm-config/get
 * Auth: required
 */

import {
  handleCors, createContext, ok, notFound,
} from '../_shared/context.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  const { data, error } = await ctx.supabase
    .from('orgs')
    .select('default_llm_provider, default_llm_base_url, default_llm_model')
    .eq('id', ctx.orgId)
    .single();

  if (error || !data) return notFound('Org LLM config');

  return ok({
    provider: (data as { default_llm_provider: string }).default_llm_provider,
    baseUrl: (data as { default_llm_base_url?: string }).default_llm_base_url ?? undefined,
    defaultModel: (data as { default_llm_model: string }).default_llm_model,
  });
});
