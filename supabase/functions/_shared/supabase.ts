/**
 * Supabase client factory for Edge Functions.
 *
 * Two clients:
 *   - anon: for calling authenticated BFF procedures as a user
 *   - serviceRole: for worker functions that need full DB access
 *
 * In production, these are configured via Edge Function secrets.
 * In local dev (supabase functions serve), these are auto-injected.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const getEnv = (key: string, fallback: string): string => {
  // Deno.env is available in Edge Functions runtime.
  // Fall back to process.env for Node.js test compatibility.
  try {
    const val = Deno.env.get(key);
    if (val) return val;
  } catch {
    // Not in Deno runtime.
  }
  return fallback;
};

export const createAnonClient = () => {
  const url = getEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  const key = getEnv(
    'SUPABASE_ANON_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  );
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { 'x-request-id': crypto.randomUUID() } },
  });
};

export const createServiceRoleClient = () => {
  const url = getEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  const key = getEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-QQ8vYHka7J2FqEsZ6tlBLU',
  );
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { 'x-request-id': crypto.randomUUID() } },
  });
};
