import { z } from 'zod';

/**
 * tRPC-style procedure definitions.
 *
 * These are the canonical contracts between clients (web, desktop, extension)
 * and the Edge Function BFF. The OpenAPI generator in @steadyflow/contracts
 * reads these to produce the SDK.
 *
 * Every input/output is a Zod schema. Every procedure declares its auth
 * requirement and rate-limit class.
 */

import { PlatformUrl } from '../schemas/platform.js';
import { IntentId, IntentKind, IntentStatus } from '../schemas/intent.js';
import { Insight, InsightCategory } from '../schemas/insight.js';
import { AuditEvent } from '../schemas/auditEvent.js';
import { Provider, LlmProvider, LlmProviderConfig } from '../schemas/provider.js';
import { SteadyFlowError } from '../errors.js';

export const AuthRequirement = z.enum(['required', 'optional', 'none']);
export type AuthRequirement = z.infer<typeof AuthRequirement>;

export const RateLimitClass = z.enum(['standard', 'strict', 'unlimited']);
export type RateLimitClass = z.infer<typeof RateLimitClass>;

export interface ProcedureDef<I, O> {
  name: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  auth: AuthRequirement;
  rateLimit: RateLimitClass;
  idempotent: boolean;
}

export const defineProcedure = <I, O>(def: ProcedureDef<I, O>): ProcedureDef<I, O> => def;

// ──────────────────────────────────────────────────────────────────────────
// intel.shop — kick off a shop analysis intent
// ──────────────────────────────────────────────────────────────────────────

export const AnalyzeShopInput = PlatformUrl.extend({
  idempotencyKey: z.string().min(1).max(255),
});
export type AnalyzeShopInput = z.infer<typeof AnalyzeShopInput>;

export const AnalyzeShopOutput = z.object({
  intentId: IntentId,
  status: IntentStatus,
});
export type AnalyzeShopOutput = z.infer<typeof AnalyzeShopOutput>;

export const analyzeShop = defineProcedure({
  name: 'intel.analyzeShop',
  input: AnalyzeShopInput,
  output: AnalyzeShopOutput,
  auth: 'required',
  rateLimit: 'standard',
  idempotent: true,
});

// ──────────────────────────────────────────────────────────────────────────
// insights.list — paginated insights for the calling org
// ──────────────────────────────────────────────────────────────────────────

export const ListInsightsInput = z.object({
  category: InsightCategory.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  /** Opaque pagination cursor (an ISO timestamp of the last item seen), not a UUID. */
  cursor: z.string().optional(),
});
export type ListInsightsInput = z.infer<typeof ListInsightsInput>;

export const ListInsightsOutput = z.object({
  items: z.array(Insight),
  nextCursor: z.string().optional(),
});
export type ListInsightsOutput = z.infer<typeof ListInsightsOutput>;

export const listInsights = defineProcedure({
  name: 'insights.list',
  input: ListInsightsInput,
  output: ListInsightsOutput,
  auth: 'required',
  rateLimit: 'standard',
  idempotent: true,
});

// ──────────────────────────────────────────────────────────────────────────
// audit.query — paginated audit log for the calling org
// ──────────────────────────────────────────────────────────────────────────

export const AuditQueryInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  /** Opaque pagination cursor (an ISO timestamp of the last item seen), not a UUID. */
  cursor: z.string().optional(),
  action: z.string().optional(),
  outcome: z.string().optional(),
});
export type AuditQueryInput = z.infer<typeof AuditQueryInput>;

export const AuditQueryOutput = z.object({
  items: z.array(AuditEvent),
  nextCursor: z.string().optional(),
});
export type AuditQueryOutput = z.infer<typeof AuditQueryOutput>;

export const auditQuery = defineProcedure({
  name: 'audit.query',
  input: AuditQueryInput,
  output: AuditQueryOutput,
  auth: 'required',
  rateLimit: 'standard',
  idempotent: true,
});

// ──────────────────────────────────────────────────────────────────────────
// keys.set — store a wrapped provider key
// ──────────────────────────────────────────────────────────────────────────

export const KeysSetInput = z.object({
  provider: Provider,
  /** Raw provider API key. Encrypted server-side with the pgsodium KEK (wrap_dek) before storage — never persisted in plaintext. */
  rawKey: z.string().min(1),
});
export type KeysSetInput = z.infer<typeof KeysSetInput>;

export const KeysSetOutput = z.object({
  provider: Provider,
  createdAt: z.string().datetime({ offset: true }),
});
export type KeysSetOutput = z.infer<typeof KeysSetOutput>;

export const keysSet = defineProcedure({
  name: 'keys.set',
  input: KeysSetInput,
  output: KeysSetOutput,
  auth: 'required',
  rateLimit: 'strict',
  idempotent: true,
});

// ──────────────────────────────────────────────────────────────────────────
// keys.list — list configured providers for the calling org
// ──────────────────────────────────────────────────────────────────────────

export const KeysListOutput = z.array(
  z.object({
    provider: Provider,
    createdAt: z.string().datetime({ offset: true }),
    rotatedAt: z.string().datetime({ offset: true }).optional(),
  }),
);
export type KeysListOutput = z.infer<typeof KeysListOutput>;

export const keysList = defineProcedure({
  name: 'keys.list',
  input: z.object({}),
  output: KeysListOutput,
  auth: 'required',
  rateLimit: 'standard',
  idempotent: true,
});

// ──────────────────────────────────────────────────────────────────────────
// keys.test — verify a stored key works
// ──────────────────────────────────────────────────────────────────────────

export const KeysTestInput = z.object({
  provider: Provider,
});
export type KeysTestInput = z.infer<typeof KeysTestInput>;

export const KeysTestOutput = z.object({
  provider: Provider,
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  error: SteadyFlowError.optional(),
});
export type KeysTestOutput = z.infer<typeof KeysTestOutput>;

export const keysTest = defineProcedure({
  name: 'keys.test',
  input: KeysTestInput,
  output: KeysTestOutput,
  auth: 'required',
  rateLimit: 'standard',
  idempotent: false,
});

// ──────────────────────────────────────────────────────────────────────────
// org.llmConfig — get/set the org's default LLM provider
// ──────────────────────────────────────────────────────────────────────────

export const OrgLlmConfigInput = z.object({
  provider: LlmProvider,
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().min(1).max(200),
});
export type OrgLlmConfigInput = z.infer<typeof OrgLlmConfigInput>;

export const OrgLlmConfigOutput = LlmProviderConfig;
export type OrgLlmConfigOutput = z.infer<typeof OrgLlmConfigOutput>;

export const orgLlmConfigGet = defineProcedure({
  name: 'org.llmConfig.get',
  input: z.object({}),
  output: OrgLlmConfigOutput,
  auth: 'required',
  rateLimit: 'standard',
  idempotent: true,
});

export const orgLlmConfigSet = defineProcedure({
  name: 'org.llmConfig.set',
  input: OrgLlmConfigInput,
  output: OrgLlmConfigOutput,
  auth: 'required',
  rateLimit: 'strict',
  idempotent: true,
});

// ──────────────────────────────────────────────────────────────────────────
// intent.cancel
// ──────────────────────────────────────────────────────────────────────────

export const IntentCancelInput = z.object({
  intentId: IntentId,
});
export type IntentCancelInput = z.infer<typeof IntentCancelInput>;

export const IntentCancelOutput = z.object({
  intentId: IntentId,
  status: IntentStatus,
});
export type IntentCancelOutput = z.infer<typeof IntentCancelOutput>;

export const intentCancel = defineProcedure({
  name: 'intent.cancel',
  input: IntentCancelInput,
  output: IntentCancelOutput,
  auth: 'required',
  rateLimit: 'standard',
  idempotent: true,
});

// ──────────────────────────────────────────────────────────────────────────
// intent.list
// ──────────────────────────────────────────────────────────────────────────

export const IntentListInput = z.object({
  kind: IntentKind.optional(),
  status: IntentStatus.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  /** Opaque pagination cursor (an ISO timestamp of the last item seen), not a UUID. */
  cursor: z.string().optional(),
});
export type IntentListInput = z.infer<typeof IntentListInput>;

export const IntentListOutput = z.object({
  items: z.array(
    z.object({
      id: IntentId,
      kind: IntentKind,
      status: IntentStatus,
      inputHash: z.string().length(64),
      createdAt: z.string().datetime({ offset: true }),
      updatedAt: z.string().datetime({ offset: true }),
    }),
  ),
  nextCursor: z.string().optional(),
});
export type IntentListOutput = z.infer<typeof IntentListOutput>;

export const intentList = defineProcedure({
  name: 'intent.list',
  input: IntentListInput,
  output: IntentListOutput,
  auth: 'required',
  rateLimit: 'standard',
  idempotent: true,
});
