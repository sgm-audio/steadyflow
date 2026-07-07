import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { workerScrape, workerEnrich, workerAnalyze, proxyFirecrawl } from './workers.js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ORG_ID = process.env.TEST_ORG_ID ?? '22222222-2222-2222-2222-222222222222';

describe('proxyFirecrawl', () => {
  it('returns placeholder when no real key configured', async () => {
    const supabase = createClient(URL, KEY);
    const result = await proxyFirecrawl(supabase, ORG_ID, 'https://example.com');
    expect(result.markdown).toBeDefined();
    expect(result.metadata).toBeDefined();
  });
});

describe('workerScrape', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient(URL, KEY);
    // Should not throw on empty queue
    await expect(workerScrape({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});

describe('workerEnrich', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient(URL, KEY);
    await expect(workerEnrich({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});

describe('workerAnalyze', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient(URL, KEY);
    await expect(workerAnalyze({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});
