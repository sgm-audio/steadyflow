import { describe, it, expect } from 'vitest';
import { DeepseekAdapter } from './adapters/deepseek.js';
import { analyzeShop, computeConfidence } from './analyzer.js';
import type { LlmAdapter } from './adapter.js';

// Mock adapter that returns predictable responses
class MockAdapter implements LlmAdapter {
  readonly provider = 'mock';

  async chat() {
    return {
      content: JSON.stringify({
        insights: [
          {
            title: 'Pricing is competitive',
            category: 'pricing',
            severity: 'low',
            body: 'Your prices are within market range.',
            citations: [{ excerpt: 'Price: $29.99' }],
          },
          {
            title: 'Missing meta descriptions',
            category: 'seo',
            severity: 'high',
            body: 'Several product pages lack meta descriptions.',
            citations: [],
          },
        ],
      }),
      model: 'mock-model',
      inputTokens: 100,
      outputTokens: 50,
      finishReason: 'stop' as const,
    };
  }
}

describe('DeepseekAdapter', () => {
  it('constructs with config', () => {
    const adapter = new DeepseekAdapter({
      apiKey: 'sk-test',
      defaultModel: 'deepseek-chat',
    });
    expect(adapter.provider).toBe('deepseek');
  });
});

describe('analyzeShop', () => {
  it('parses structured JSON insights', async () => {
    const result = await analyzeShop(new MockAdapter(), {
      content: '# Demo Store\nPrice: $29.99',
      url: 'https://demo.myshopify.com',
      sourceId: '00000000-0000-0000-0000-000000000001',
      platform: 'shopify',
    });

    expect(result.insights).toHaveLength(2);
    expect(result.insights[0]?.category).toBe('pricing');
    expect(result.insights[1]?.severity).toBe('high');
    expect(result.provider).toBe('mock');
  });

  it('handles empty LLM response', async () => {
    const emptyAdapter: LlmAdapter = {
      provider: 'empty',
      chat: async () => ({
        content: 'not json',
        model: 'test', inputTokens: 0, outputTokens: 0, finishReason: 'stop',
      }),
    };

    const result = await analyzeShop(emptyAdapter, {
      content: 'x', url: 'x', sourceId: 'x', platform: 'shopify',
    });
    expect(result.insights).toHaveLength(0);
  });

  it('caps insights at 5', async () => {
    const manyAdapter: LlmAdapter = {
      provider: 'many',
      chat: async () => ({
        content: JSON.stringify({
          insights: Array.from({ length: 10 }, (_, i) => ({
            title: `Insight ${i}`, category: 'positioning', severity: 'medium', body: 'x', citations: [],
          })),
        }),
        model: 'test', inputTokens: 0, outputTokens: 0, finishReason: 'stop',
      }),
    };

    const result = await analyzeShop(manyAdapter, {
      content: 'x', url: 'x', sourceId: 'x', platform: 'shopify',
    });
    expect(result.insights).toHaveLength(5);
  });

  it('maps citations with sourceId and url', async () => {
    const result = await analyzeShop(new MockAdapter(), {
      content: 'x', url: 'https://example.com', sourceId: 'src-1', platform: 'shopify',
    });
    const citation = result.insights[0]?.citations[0];
    expect(citation?.sourceId).toBe('src-1');
    expect(citation?.url).toBe('https://example.com');
  });
});

describe('computeConfidence', () => {
  it('returns 0.5-1.0 range', () => {
    const result = {
      insights: [],
      model: 'test', provider: 'test',
      inputTokens: 0, outputTokens: 0,
    };
    const score = computeConfidence(result);
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('scores higher with more insights', () => {
    const empty = computeConfidence({
      insights: [], model: 't', provider: 't', inputTokens: 0, outputTokens: 0,
    });
    const full = computeConfidence({
      insights: Array.from({ length: 5 }, () => ({
        category: 'pricing', severity: 'high' as const,
        title: 'x', body: 'x', citations: [{ sourceId: 'x', excerpt: 'x' }],
        promptVersion: 'v1', promptHash: 'x',
      })),
      model: 't', provider: 't', inputTokens: 100, outputTokens: 50,
    });
    expect(full).toBeGreaterThan(empty);
  });
});
