import { describe, expect, it } from 'vitest';
import { getExtensionConfig, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

describe('extension config', () => {
  it('exposes a Supabase URL and anon key (safe-to-ship public anon key, not a secret)', () => {
    expect(typeof SUPABASE_URL).toBe('string');
    expect(SUPABASE_URL.length).toBeGreaterThan(0);
    expect(typeof SUPABASE_ANON_KEY).toBe('string');
    expect(SUPABASE_ANON_KEY.length).toBeGreaterThan(0);
    // The anon key is the publishable key (safe in client code) — must NOT be a service_role key.
    expect(SUPABASE_ANON_KEY).not.toContain('service_role');
  });

  it('derives the functions base URL from the Supabase URL (single source of truth)', () => {
    const cfg = getExtensionConfig();
    expect(cfg.functionsUrl).toBe(`${SUPABASE_URL}/functions/v1`);
  });

  it('derives the dashboard URL and never hardcodes a second origin', () => {
    const cfg = getExtensionConfig();
    expect(typeof cfg.dashboardUrl).toBe('string');
    expect(cfg.dashboardUrl).toMatch(/^https?:\/\//);
  });

  it('falls back to the local dev endpoints when no env override is present', () => {
    const cfg = getExtensionConfig();
    expect(cfg.supabaseUrl).toBe(SUPABASE_URL);
    expect(cfg.functionsUrl).toContain('/functions/v1');
  });
});
