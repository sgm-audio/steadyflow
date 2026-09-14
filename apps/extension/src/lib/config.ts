/**
 * Extension runtime configuration.
 *
 * Single source of truth for the Supabase project URL, the publishable anon
 * key, and the derived Edge Functions + dashboard base URLs. Centralizing them
 * here (a) keeps the three call sites (supabase client, BFF client, popup) from
 * drifting, and (b) makes the dev → prod switch a one-line edit instead of a
 * grep-and-replace across four files.
 *
 * Security note: `SUPABASE_ANON_KEY` is the *publishable* (anon) key. It is
 * designed to ship in client code and is gated by Row-Level Security on every
 * table — it is NOT a secret and carries no service_role privileges. The
 * service_role key must never appear in this package.
 *
 * ponytail: env override point is here (`import.meta.env.VITE_*`) for the
 * production build; local dev uses the localhost defaults. Add the prod values
 * to a `.env.production` (gitignored) when the hosted project exists.
 */

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://127.0.0.1:54321';

export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export interface ExtensionConfig {
  supabaseUrl: string;
  anonKey: string;
  /** Edge Functions BFF base (derived from supabaseUrl). */
  functionsUrl: string;
  /** Web dashboard base (for "View in Dashboard" links). */
  dashboardUrl: string;
}

export const getExtensionConfig = (): ExtensionConfig => {
  const supabaseUrl = SUPABASE_URL.replace(/\/+$/, '');
  const dashboardUrl =
    (import.meta.env.VITE_DASHBOARD_URL as string | undefined) ?? 'http://127.0.0.1:3000';
  return {
    supabaseUrl,
    anonKey: SUPABASE_ANON_KEY,
    functionsUrl: `${supabaseUrl}/functions/v1`,
    dashboardUrl: dashboardUrl.replace(/\/+$/, ''),
  };
};
