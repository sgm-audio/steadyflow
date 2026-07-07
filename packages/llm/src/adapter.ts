/**
 * LLM Adapter interface.
 *
 * All LLM providers implement this interface. The adapter pattern allows
 * swapping providers without changing the analysis pipeline.
 */

export interface LlmAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: 'stop' | 'length' | 'error';
}

export interface LlmAdapter {
  readonly provider: string;
  chat(messages: LlmMessage[], options?: LlmChatOptions): Promise<LlmResponse>;
}

export interface LlmChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}
