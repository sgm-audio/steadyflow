import { z } from 'zod';

/**
 * Provider identifiers. Used as keys in the BYOK vault and in audit logs.
 * Adding a provider requires updating:
 *   - packages/llm/src/adapters/*
 *   - supabase/functions/proxy-*
 *   - apps/edge/supabase/migrations/* (CHECK constraint)
 */
export const Provider = z.enum([
  'firecrawl',
  'hunter',
  'tavily',
  'deepseek',
  'nvidia-nim',
  'groq',
  'openai-compatible',
]);
export type Provider = z.infer<typeof Provider>;

export const LlmProvider = z.enum(['deepseek', 'nvidia-nim', 'groq', 'openai-compatible']);
export type LlmProvider = z.infer<typeof LlmProvider>;

export const LlmProviderConfig = z
  .object({
    provider: LlmProvider,
    /** Required for openai-compatible; optional for hosted providers. */
    baseUrl: z.string().url().optional(),
    /** Default model id for this provider. */
    defaultModel: z.string().min(1).max(200),
  })
  .strict();
export type LlmProviderConfig = z.infer<typeof LlmProviderConfig>;
