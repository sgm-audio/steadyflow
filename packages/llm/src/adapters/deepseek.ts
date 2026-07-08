/**
 * Deepseek adapter — OpenAI-compatible chat completions.
 *
 * Deepseek API is compatible with the OpenAI chat completions format.
 * Supports JSON mode, token counting, and error handling.
 */

import type { LlmAdapter, LlmAdapterConfig, LlmChatOptions, LlmMessage, LlmResponse } from '../adapter.js';

export class DeepseekAdapter implements LlmAdapter {
  readonly provider = 'deepseek';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: LlmAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.deepseek.com';
    this.defaultModel = config.defaultModel;
  }

  async chat(messages: LlmMessage[], options: LlmChatOptions = {}): Promise<LlmResponse> {
    const model = options.model ?? this.defaultModel;
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, options.timeoutMs ?? 60000);

    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature: options.temperature ?? 0.3,
      };

      if (options.maxTokens) body.max_tokens = options.maxTokens;
      if (options.jsonMode) body.response_format = { type: 'json_object' };

      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        if (res.status === 429) throw new Error(`Deepseek rate limited: ${errorText}`);
        if (res.status === 401) throw new Error(`Deepseek auth failed: check API key`);
        throw new Error(`Deepseek returned ${res.status}: ${errorText}`);
      }

      const json = await res.json() as {
        choices: { message: { content: string }; finish_reason: string }[];
        model: string;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      const choice = json.choices[0];
      if (!choice) throw new Error('Deepseek returned empty choices');

      return {
        content: choice.message.content,
        model: json.model,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        finishReason: mapFinishReason(choice.finish_reason),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

const mapFinishReason = (reason: string): LlmResponse['finishReason'] => {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    default: return 'error';
  }
};

/** Factory — call this to construct the default adapter for an org. */
export const createDeepseekAdapter = (config: LlmAdapterConfig): LlmAdapter => {
  return new DeepseekAdapter(config);
};
