/**
 * proxy/llm — Call the org's configured LLM provider.
 *
 * POST /proxy/llm
 * Auth: required
 * Rate limit: llm bucket
 */
import { z } from 'npm:zod@3';
import {
  handleCors,
  createContext,
  parseInput,
  checkRateLimit,
  writeAudit,
  withProviderKey,
  ok,
  badRequest,
  internalError,
  rateLimited,
} from '../_shared/context.ts';

const LlmInput = z.object({
  prompt: z.string().min(1).max(32000),
  model: z.string().max(200).optional(),
});

// Map org provider to API endpoint
const PROVIDER_ENDPOINTS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/chat/completions',
  'nvidia-nim': 'https://integrate.api.nvidia.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  'openai-compatible': '',
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ctx = await createContext(req);
  if (ctx instanceof Response) return ctx;

  let body: unknown;
  try { body = await req.json(); }
  catch { return badRequest('Invalid JSON body'); }

  const parsed = parseInput(LlmInput, body);
  if (!parsed.ok) return badRequest(parsed.error.message);

  const { prompt, model } = parsed.value;
  const startMs = Date.now();

  const rl = await checkRateLimit(ctx.supabase, ctx.userId, ctx.orgId, 'llm');
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  // Get org's LLM config
  const { data: org, error: orgError } = await ctx.supabase
    .from('orgs')
    .select('default_llm_provider, default_llm_base_url, default_llm_model')
    .eq('id', ctx.orgId)
    .single();

  if (orgError || !org) return internalError('Org LLM config not found');

  const provider = (org as { default_llm_provider: string }).default_llm_provider;
  const baseUrl = (org as { default_llm_base_url?: string }).default_llm_base_url;
  const defaultModel = (org as { default_llm_model: string }).default_llm_model;
  const endpoint = baseUrl || PROVIDER_ENDPOINTS[provider];

  if (!endpoint) return badRequest(`Unknown LLM provider: ${provider}`);

  // Look up the key
  const { data: envelope, error: envError } = await ctx.supabase
    .from('keys_envelopes')
    .select('*')
    .eq('org_id', ctx.orgId)
    .eq('provider', provider)
    .single();

  if (envError || !envelope) return internalError(`LLM key not configured for ${provider}`);

  const dekWrapped = new Uint8Array((envelope as { dek_wrapped: string }).dek_wrapped.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  const ciphertext = new Uint8Array((envelope as { wrapped_key: string }).wrapped_key.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  const iv = new Uint8Array((envelope as { iv: string }).iv.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));

  const usedModel = model ?? defaultModel;

  try {
    const result = await withProviderKey(ctx.supabase, dekWrapped, ciphertext, iv, async (apiKey: string) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: usedModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`LLM API error (${res.status}): ${errBody.slice(0, 200)}`);
      }
      return res.json();
    });

    writeAudit(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId,
      action: 'llm.chat', outcome: 'success',
      input: { model: usedModel },
      provider,
      durationMs: Date.now() - startMs,
    }).catch(() => {});

    return ok(result);
  } catch (err) {
    return internalError(String(err));
  }
});
