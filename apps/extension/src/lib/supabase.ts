/**
 * Supabase auth client for Chrome Extension.
 * 
 * Uses the chrome.identity API for OAuth PKCE flow.
 * Stores session in chrome.storage.local for persistence.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      async getItem(key: string) {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? null;
      },
      async setItem(key: string, value: string) {
        await chrome.storage.local.set({ [key]: value });
      },
      async removeItem(key: string) {
        await chrome.storage.local.remove(key);
      },
    },
    autoRefreshToken: true,
    persistSession: true,
  },
});

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

/**
 * Sign in with email/password directly (simpler than OAuth PKCE for MVP).
 * The popup collects credentials and calls this.
 */
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

/**
 * Sign out.
 */
export const signOut = async () => {
  await supabase.auth.signOut();
};

/**
 * Get the current auth token for API calls.
 */
export const getToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};
