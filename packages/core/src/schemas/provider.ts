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
  'tavily',
  'deepseek',
  'nvidia-nim',
  'groq',
  'openai-compatible',
  'shopify-admin',
  'printify',
  /** Amazon Selling Partner API LWA refresh token (or app credentials bundle). */
  'amazon-sp-api',
  /** Alibaba Open Platform / 1688 distributor credentials. */
  'alibaba',
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
