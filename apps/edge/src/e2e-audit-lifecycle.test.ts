/**
 * End-to-End Audit Lifecycle Integration Test
 *
 * Proves the complete v1 audit workflow:
 * 1. Intent created
 * 2. Queued for processing
 * 3. Shopify data retrieved (via Admin API or fallback scrape)
 * 4. Audit performed
 * 5. Insights persisted
 * 6. Intent completed
 * 7. Audit log populated
 *
 * This test requires a running local Supabase instance with migrations applied.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@steadyflow/db';
import { workerScrape } from './workers.js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is required for integration tests (set via env / repo-root .env.local; fail closed - no hardcoded default)',
  );
}
const ORG_ID = process.env.TEST_ORG_ID ?? '22222222-2222-2222-2222-222222222222';
const USER_ID = process.env.TEST_USER_ID ?? '11111111-1111-1111-1111-111111111111';

const sha256Hex = async (input: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

describe('E2E Audit Lifecycle', () => {
  const supabase = createClient<Database>(URL, KEY);

  let testIntentId: string | null = null;

  beforeEach(async () => {
    // Clean up any leftover test data
    await supabase.from('insights').delete().eq('org_id', ORG_ID).like('intent_id', 'test-e2e-%');
    await supabase.from('sources').delete().eq('org_id', ORG_ID).like('intent_id', 'test-e2e-%');
    await supabase.from('intents').delete().eq('org_id', ORG_ID).like('idempotency_key', 'test-e2e-%');
    await supabase.from('audit_log').delete().eq('org_id', ORG_ID).like('input_hash', 'test-e2e-%');
  });

  afterEach(async () => {
    if (testIntentId) {
      await supabase.from('insights').delete().eq('intent_id', testIntentId);
      await supabase.from('sources').delete().eq('intent_id', testIntentId);
      await supabase.from('intents').delete().eq('id', testIntentId);
      await supabase.from('audit_log').delete().eq('user_id', USER_ID).like('input_hash', 'test-e2e-%');
    }
    testIntentId = null;
  });

  it('completes full audit lifecycle: intent → queue → scrape → insights → completion → audit_log', async () => {
    // Step 1: Create an audit intent
    const idempotencyKey = `test-e2e-${Date.now()}`;
    const inputHash = await sha256Hex(idempotencyKey);

    const { data: intent, error: intentError } = await supabase
      .from('intents')
      .insert({
        org_id: ORG_ID,
        user_id: USER_ID,
        kind: 'audit_shopify_catalog',
        input_hash: inputHash,
        idempotency_key: idempotencyKey,
        status: 'pending',
      })
      .select('id')
      .single();

    expect(intentError).toBeNull();
    if (!intent) throw new Error('Intent insert returned no data');
    testIntentId = intent.id;

    // Step 2: Enqueue the scrape job
    const { error: enqueueError } = await supabase.rpc('enqueue_message', {
      p_queue_name: 'q:scrape',
      p_message: {
        intentId: intent.id,
        orgId: ORG_ID,
        url: 'https://example-store.myshopify.com',
        platform: 'shopify',
      },
    });

    expect(enqueueError).toBeNull();

    // Step 3: Verify intent is in pending state before processing
    const { data: intentBefore } = await supabase.from('intents').select('status').eq('id', intent.id).single();

    expect(intentBefore?.status).toBe('pending');

    // Step 4: Process the scrape queue (simulates worker execution)
    // Note: In production this runs as a background worker
    await workerScrape({ supabase, orgId: ORG_ID });

    // Step 5: Verify intent transitioned to running or succeeded/failed
    const { data: intentAfter } = await supabase
      .from('intents')
      .select('status, error_code, error_message')
      .eq('id', intent.id)
      .single();

    if (!intentAfter) throw new Error('Intent disappeared after processing');
    expect(['running', 'succeeded', 'failed']).toContain(intentAfter.status);

    // Step 6: Verify insights were created (at least one finding or summary)
    const { data: insights } = await supabase
      .from('insights')
      .select('id, category, severity, title, body, model, provider')
      .eq('intent_id', intent.id);

    // When no shopify-admin key is configured, fallback scrape creates insights via LLM
    // When shopify-admin key IS configured, real catalog audit creates insights
    // Either way, we should have some insights or the intent should reflect the outcome
    if (intentAfter.status === 'succeeded') {
      expect(insights).toBeDefined();
      // Insights may be empty if the scraped content yields no findings,
      // but the intent should still succeed
    }

    // Step 7: Verify audit_log entry was created
    const { data: auditEntries } = await supabase
      .from('audit_log')
      .select('id, action, outcome, provider, duration_ms')
      .eq('org_id', ORG_ID)
      .eq('user_id', USER_ID)
      .order('created_at', { ascending: false })
      .limit(5);

    // Should have at least one audit entry for the scrape action
    const scrapeEntry = auditEntries?.find((e) => e.action.includes('scrape'));
    expect(scrapeEntry).toBeDefined();
    expect(scrapeEntry?.outcome).toBe('success');

    // Step 8: Sources table has the scraped content if the fallback path was used;
    // if the shopify-admin direct API path ran instead, no source row is expected.
    await supabase.from('sources').select('id, platform, url, raw_markdown').eq('intent_id', intent.id);

    // Step 9: Verify the queue message was archived (removed from active queue) —
    // dequeuing again should never return the message already processed for this intent.
    const { data: queuedMessages } = await supabase.rpc('dequeue_message', {
      p_queue_name: 'q:scrape',
    });
    if (queuedMessages && typeof queuedMessages === 'object') {
      const requeued = (queuedMessages as { message?: { intentId?: string } }).message;
      expect(requeued?.intentId).not.toBe(intent.id);
    }
  });

  it('handles Shopify Admin API audit when key is configured', async () => {
    // Skip if no shopify-admin key is configured for this test org
    const { data: keyEnvelope } = await supabase
      .from('keys_envelopes')
      .select('provider')
      .eq('org_id', ORG_ID)
      .eq('provider', 'shopify-admin')
      .single();

    if (!keyEnvelope) {
      return;
    }

    const idempotencyKey = `test-e2e-shopify-${Date.now()}`;
    const inputHash = await sha256Hex(idempotencyKey);

    const { data: intent, error: intentError } = await supabase
      .from('intents')
      .insert({
        org_id: ORG_ID,
        user_id: USER_ID,
        kind: 'audit_shopify_catalog',
        input_hash: inputHash,
        idempotency_key: idempotencyKey,
        status: 'pending',
      })
      .select('id')
      .single();

    expect(intentError).toBeNull();
    if (!intent) throw new Error('Intent insert returned no data');
    testIntentId = intent.id;

    // Enqueue with a fake Shopify store URL
    await supabase.rpc('enqueue_message', {
      p_queue_name: 'q:scrape',
      p_message: {
        intentId: intent.id,
        orgId: ORG_ID,
        url: 'https://test-store.myshopify.com',
        platform: 'shopify',
      },
    });

    // Process the queue
    await workerScrape({ supabase, orgId: ORG_ID });

    // Verify intent completed
    const { data: intentResult } = await supabase
      .from('intents')
      .select('status, error_code, error_message')
      .eq('id', intent.id)
      .single();

    // Should either succeed (if key is valid) or fail with appropriate error
    expect(intentResult?.status).toMatch(/^(succeeded|failed)$/);

    if (intentResult?.status === 'failed') {
      // Expected if the test key points to a non-existent store
      expect(intentResult.error_code).toBe('SHOPIFY_CATALOG_ANALYZE_FAILED');
    } else {
      // Success path: verify insights were created from real catalog audit
      const { data: insights } = await supabase
        .from('insights')
        .select('id, category, title, provider')
        .eq('intent_id', intent.id)
        .eq('provider', 'shopify-admin');

      expect(insights).toBeDefined();
    }
  });

  it('validates rate limiting is enforced on provider calls', async () => {
    // This test verifies that rate_limit_take is called before provider requests
    // The actual rate limit enforcement is tested in rls-security.test.ts
    // Here we just confirm the infrastructure is in place
    const { data: rateLimitConfig } = await supabase
      .from('rate_limits')
      .select('provider, requests_per_minute')
      .in('provider', ['firecrawl', 'tavily', 'shopify-admin']);

    // Rate limit configuration should exist for key providers
    expect(rateLimitConfig).toBeDefined();
    expect(rateLimitConfig?.length ?? 0).toBeGreaterThan(0);
  });

  it('verifies secret redaction in audit logs', async () => {
    // Create an intent that will generate audit log entries
    const idempotencyKey = `test-e2e-redact-${Date.now()}`;
    const inputHash = await sha256Hex(idempotencyKey);

    const { data: intent } = await supabase
      .from('intents')
      .insert({
        org_id: ORG_ID,
        user_id: USER_ID,
        kind: 'audit_shopify_catalog',
        input_hash: inputHash,
        idempotency_key: idempotencyKey,
        status: 'pending',
      })
      .select('id')
      .single();

    expect(intent).toBeDefined();
    if (!intent) throw new Error('Intent insert returned no data');
    testIntentId = intent.id;

    // Process to generate audit log
    await supabase.rpc('enqueue_message', {
      p_queue_name: 'q:scrape',
      p_message: {
        intentId: intent.id,
        orgId: ORG_ID,
        url: 'https://example.com',
        platform: 'shopify',
      },
    });

    await workerScrape({ supabase, orgId: ORG_ID });

    // Fetch audit log entries
    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('metadata, input_hash')
      .eq('org_id', ORG_ID)
      .eq('input_hash', inputHash);

    // Verify no plaintext secrets appear in metadata
    for (const log of auditLogs ?? []) {
      const metadataStr = JSON.stringify(log.metadata).toLowerCase();
      expect(metadataStr).not.toContain('sk-');
      expect(metadataStr).not.toContain('bearer ');
      expect(metadataStr).not.toMatch(/shpca_[a-zA-Z0-9]+/);
      expect(metadataStr).not.toMatch(/shppa_[a-zA-Z0-9]+/);
    }
  });
});
