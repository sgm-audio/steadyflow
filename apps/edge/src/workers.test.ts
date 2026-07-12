import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@steadyflow/db';
import { workerScrape, workerEnrich, workerAnalyze, proxyFirecrawl } from './workers.js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ORG_ID = process.env.TEST_ORG_ID ?? '22222222-2222-2222-2222-222222222222';

describe('proxyFirecrawl', () => {
  it('falls back to a direct scrape when no Firecrawl key is configured', async () => {
    const supabase = createClient<Database>(URL, KEY);
    const result = await proxyFirecrawl(supabase, ORG_ID, 'https://example.com');
    expect(result.markdown).toContain('Example Domain');
  });

  it('refuses to scrape a URL resolving to a private/loopback address (SSRF guard)', async () => {
    const supabase = createClient<Database>(URL, KEY);
    await expect(proxyFirecrawl(supabase, ORG_ID, 'http://127.0.0.1:54321/')).rejects.toThrow(
      /private address/,
    );
    await expect(proxyFirecrawl(supabase, ORG_ID, 'http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private address/,
    );
  });

  it('refuses to scrape a non-http(s) URL', async () => {
    const supabase = createClient<Database>(URL, KEY);
    await expect(proxyFirecrawl(supabase, ORG_ID, 'file:///etc/passwd')).rejects.toThrow(
      /non-http/,
    );
  });
});

describe('workerScrape', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient<Database>(URL, KEY);
    // Should not throw on empty queue
    await expect(workerScrape({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});

describe('workerEnrich', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient<Database>(URL, KEY);
    await expect(workerEnrich({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});

describe('workerAnalyze', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient<Database>(URL, KEY);
    await expect(workerAnalyze({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});
