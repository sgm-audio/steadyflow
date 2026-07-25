import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@steadyflow/db';
import { workerScrape, workerEnrich, workerAnalyze, workerMonitorCompetitor, proxyFirecrawl } from './workers.js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Checked in beforeAll / per-test — avoid module-load throw aborting other suites.
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.TEST_ORG_ID ?? '22222222-2222-2222-2222-222222222222';

function requireKey(): string {
  if (!KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for integration tests (set via env / repo-root .env.local; fail closed)',
    );
  }
  return KEY;
}

describe('proxyFirecrawl', () => {
  it('falls back to a direct scrape when no Firecrawl key is configured', async () => {
    const supabase = createClient<Database>(URL, requireKey());
    const result = await proxyFirecrawl(supabase, ORG_ID, 'https://example.com');
    expect(result.markdown).toContain('Example Domain');
  });

  it('refuses to scrape a URL resolving to a private/loopback address (SSRF guard)', async () => {
    const supabase = createClient<Database>(URL, requireKey());
    await expect(proxyFirecrawl(supabase, ORG_ID, 'http://127.0.0.1:54321/')).rejects.toThrow(
      /private address/,
    );
    await expect(proxyFirecrawl(supabase, ORG_ID, 'http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private address/,
    );
  });

  it('refuses to scrape a non-http(s) URL', async () => {
    const supabase = createClient<Database>(URL, requireKey());
    await expect(proxyFirecrawl(supabase, ORG_ID, 'file:///etc/passwd')).rejects.toThrow(
      /non-http/,
    );
  });
});

describe('workerScrape', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient<Database>(URL, requireKey());
    // Should not throw on empty queue
    await expect(workerScrape({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});

describe('workerEnrich', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient<Database>(URL, requireKey());
    await expect(workerEnrich({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});

describe('workerAnalyze', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient<Database>(URL, requireKey());
    await expect(workerAnalyze({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });
});

describe('workerMonitorCompetitor', () => {
  it('handles empty queue gracefully', async () => {
    const supabase = createClient<Database>(URL, requireKey());
    await expect(workerMonitorCompetitor({ supabase, orgId: ORG_ID })).resolves.toBeUndefined();
  });

  it('falls back to scraping and records a snapshot when no Tavily key is configured', async () => {
    const supabase = createClient<Database>(URL, requireKey());

    const { data: competitor, error: compError } = await supabase
      .from('competitors')
      .insert({ org_id: ORG_ID, name: 'Example Competitor', url: 'https://example.com' })
      .select('id')
      .single();
    expect(compError).toBeNull();

    const { data: intent, error: intentError } = await supabase
      .from('intents')
      .insert({
        org_id: ORG_ID,
        user_id: '11111111-1111-1111-1111-111111111111',
        kind: 'monitor_competitor',
        input_hash: '0'.repeat(64),
        idempotency_key: `test-monitor-${Date.now()}`,
      })
      .select('id')
      .single();
    expect(intentError).toBeNull();

    await supabase.rpc('enqueue_message', {
      p_queue_name: 'q:monitor',
      p_message: { intentId: intent?.id, competitorId: competitor?.id },
    });

    await workerMonitorCompetitor({ supabase, orgId: ORG_ID });

    const { data: snapshot } = await supabase
      .from('competitor_snapshots')
      .select('source, competitor_id')
      .eq('competitor_id', competitor?.id ?? '')
      .single();

    expect(snapshot?.source).toBe('scrape');

    // Cleanup: cascades to competitor_snapshots via FK.
    await supabase.from('competitors').delete().eq('id', competitor?.id ?? '');
    await supabase.from('intents').delete().eq('id', intent?.id ?? '');
  });
});
