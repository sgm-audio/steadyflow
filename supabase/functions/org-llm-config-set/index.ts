/**
 * org/llm-config/set — Set the org's default LLM configuration.
 *
 * POST /org/llm-config/set
 * Auth: required
 * Body: { provider, baseUrl?, defaultModel }
 */

import { z } from 'npm:zod@3';
import {
  badRequest,
  createContext,
  handleCors,
  internalError,
  ok,
  parseInput,
  writeAudit,
} from '../_shared/context.ts';

const ConfigInput = z.object({
  provider: z.enum(['deepseek', 'nvidia-nim', 'groq', 'openai-compatible']),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().min(1).max(200),
});

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  const parsed = parseInput(ConfigInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const { provider, baseUrl, defaultModel } = parsed.value;
  const startMs = Date.now();

  const { data, error } = await ctx.supabase
    .from('orgs')
    .update({
      default_llm_provider: provider,
      default_llm_base_url: baseUrl ?? null,
      default_llm_model: defaultModel,
    })
    .eq('id', ctx.orgId)
    .select('default_llm_provider, default_llm_base_url, default_llm_model')
    .single();

  if (error) return internalError(`Failed to update LLM config: ${error.message}`);

  writeAudit(ctx.supabase, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: 'org.llmConfig.set',
    outcome: 'success',
    input: { provider },
    durationMs: Date.now() - startMs,
  }).catch(() => {});

  return ok({
    provider: (data as { default_llm_provider: string }).default_llm_provider,
    baseUrl: (data as { default_llm_base_url?: string }).default_llm_base_url ?? undefined,
    defaultModel: (data as { default_llm_model: string }).default_llm_model,
  });
});
