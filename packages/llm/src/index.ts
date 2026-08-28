export type { LlmAdapter, LlmAdapterConfig, LlmChatOptions, LlmMessage, LlmResponse } from './adapter.js';
export { DeepseekAdapter, createDeepseekAdapter } from './adapters/deepseek.js';
export { analyzeShop, computeConfidence } from './analyzer.js';
export type { AnalyzeRequest, AnalyzeResult } from './analyzer.js';
export {
  LlmError,
  LlmEmptyResponseError,
  LlmMalformedJsonError,
  LlmRefusalError,
} from './errors.js';
export type { Insight, InsightCitation } from './insight-types.js';
