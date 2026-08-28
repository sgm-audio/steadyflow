/**
 * Shop analyzer — generates structured insights from scraped content.
 *
 * Uses the LLM adapter to analyze e-commerce store pages and produce
 * Insights with citations, categories, and severity ratings.
 */

import type { LlmAdapter } from './adapter.js';
import type { Insight } from './insight-types.js';
import {
  LlmEmptyResponseError,
  LlmMalformedJsonError,
  LlmRefusalError,
} from './errors.js';

export interface AnalyzeRequest {
  /** The scraped markdown content of the shop page. */
  content: string;
  /** URL of the analyzed page (for citations). */
  url: string;
  /** Supabase source ID (for citation links). */
  sourceId: string;
  /** The platform (shopify, etsy, etc.). */
  platform: string;
}

export interface AnalyzeResult {
  insights: Insight[];
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

const SHOP_ANALYSIS_PROMPT = `You are an e-commerce growth analyst. Analyze the provided Shopify store page content and return structured insights.

For each insight, provide:
- title: A short, descriptive title (max 200 chars)
- category: One of "pricing", "positioning", "product_mix", "marketing", "seo", "conversion", "inventory", "trend"
- severity: "low", "medium", or "high" based on impact
- body: Detailed analysis and recommendation (max 5000 chars)
- citations: Array of relevant excerpts from the source content (max 20 citations per insight, each with excerpt field max 500 chars)

Focus on actionable insights that would help the store owner improve:
1. Product positioning and differentiation
2. Pricing strategy
3. SEO and discoverability
4. Marketing effectiveness
5. Conversion optimization

Return ONLY valid JSON with this structure:
{
  "insights": [
    { "title": "...", "category": "...", "severity": "...", "body": "...", "citations": [{"excerpt": "..."}] }
  ]
}

Content to analyze:
{content}`;

/**
 * Analyze a shop's scraped content and return structured insights.
 */
export const analyzeShop = async (
  adapter: LlmAdapter,
  request: AnalyzeRequest,
  promptVersion = 'v1',
): Promise<AnalyzeResult> => {
  const prompt = SHOP_ANALYSIS_PROMPT.replace('{content}', request.content.slice(0, 12000));

  const response = await adapter.chat(
    [{ role: 'user', content: prompt }],
    { jsonMode: true, temperature: 0.3, maxTokens: 4096 },
  );

  const content = response.content.trim();
  if (content.length === 0) {
    throw new LlmEmptyResponseError();
  }
  if (response.finishReason === 'error') {
    throw new LlmRefusalError();
  }

  // Parse the structured response — a malformed/refused body is a named failure,
  // not a silent empty result.
  let rawInsights: unknown[];
  try {
    const parsed = JSON.parse(content) as { insights?: unknown[] };
    rawInsights = parsed.insights ?? [];
  } catch {
    throw isRefusal(content) ? new LlmRefusalError() : new LlmMalformedJsonError();
  }

  // Map to typed Insight objects
  const toStr = (v: unknown, fallback: string): string => typeof v === 'string' ? v : fallback;

  const insights: Insight[] = rawInsights.slice(0, 5).map((raw, _idx) => {
    const i = raw as Record<string, unknown>;
    const citations = (Array.isArray(i.citations) ? i.citations.slice(0, 20) : []) as Record<string, unknown>[];

    return {
      category: validCategory(toStr(i.category, 'positioning')),
      severity: validSeverity(toStr(i.severity, 'medium')),
      title: toStr(i.title, 'Untitled insight').slice(0, 200),
      body: toStr(i.body, 'No details provided').slice(0, 5000),
      citations: citations.map((c) => ({
        sourceId: request.sourceId,
        url: request.url,
        excerpt: toStr(c.excerpt, '').slice(0, 500),
      })),
      promptVersion,
      promptHash: '', // Filled by the worker after hashing
    };
  });

  return {
    insights,
    model: response.model,
    provider: adapter.provider,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };
};

const validCategory = (c: string): string => {
  const categories = ['pricing', 'positioning', 'product_mix', 'marketing', 'seo', 'conversion', 'inventory', 'trend'];
  return categories.includes(c) ? c : 'positioning';
};

/**
 * Detect a safety/policy refusal in a non-JSON response body. Applied only
 * after JSON parsing fails, so a legitimate JSON payload is never misread.
 */
const isRefusal = (content: string): boolean =>
  REFUSAL_PATTERNS.some((re) => re.test(content));

const REFUSAL_PATTERNS: readonly RegExp[] = [
  /I cannot/i,
  /I can't/i,
  /I am not able/i,
  /as an AI/i,
  /I'm sorry, but I/i,
  /against my (?:content|safety|policy) /i,
];

const validSeverity = (s: string): Insight['severity'] => {
  const severities: Insight['severity'][] = ['low', 'medium', 'high'];
  return severities.includes(s as Insight['severity']) ? (s as Insight['severity']) : 'medium';
};

/**
 * Simple confidence heuristic.
 * Scores 0-1 based on source freshness, response coherence, and parse success.
 */
export const computeConfidence = (result: AnalyzeResult): number => {
  let score = 0.5; // Base

  // More insights = higher confidence (up to 5)
  score += Math.min(result.insights.length, 5) * 0.05;

  // LLM actually returned a response
  if (result.outputTokens > 0) score += 0.1;

  // Citations present
  const hasCitations = result.insights.some((i) => i.citations.length > 0);
  if (hasCitations) score += 0.1;

  return Math.min(score, 1.0);
};
