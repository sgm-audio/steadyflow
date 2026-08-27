/**
 * Insight types used by the analyzer and LLM package.
 *
 * Mirrors the database schema but decoupled from Supabase so the
 * LLM package has no database dependency.
 */

export interface InsightCitation {
  sourceId: string;
  url?: string;
  excerpt?: string;
}

export interface Insight {
  category: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  body: string;
  citations: InsightCitation[];
  promptVersion: string;
  promptHash: string;
}
