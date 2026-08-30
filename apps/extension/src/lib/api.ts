/**
 * SteadyFlow BFF API client for the Chrome Extension.
 *
 * Calls Edge Functions through the Supabase API gateway.
 */

const API_URL = 'http://127.0.0.1:54321/functions/v1';

import { getToken } from './supabase.js';

export interface AnalyzeShopParams {
  platform: string;
  url: string;
  idempotencyKey: string;
  requiresAuth?: boolean;
}

export interface AnalyzeShopResult {
  intentId: string;
  status: string;
}

/**
 * Submit a shop URL for analysis.
 */
export const analyzeShop = async (params: AnalyzeShopParams): Promise<AnalyzeShopResult> => {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/intel-analyze-shop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))) as {
      error?: { message?: string };
    };
    throw new Error(err.error?.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<AnalyzeShopResult>;
};

/**
 * Fetch the org's LLM config.
 */
export const getLlmConfig = async () => {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/org-llm-config-get`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
};
