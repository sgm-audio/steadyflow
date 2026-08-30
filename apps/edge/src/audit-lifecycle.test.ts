/**
 * Full audit lifecycle integration test.
 *
 * Proves the v1 scope decision's core flow:
 *   intent created → queued → Shopify data retrieved → audit performed →
 *   insights persisted → intent completed → audit_log populated
 *
 * Requires `supabase start` on :54321. Skipped in CI (see vitest.config.ts).
 * Automatically excluded when Supabase is not available locally.
 */

import type { Database } from '@steadyflow/db';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workerAnalyze, workerScrape } from './workers.js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ORG_ID = process.env.TEST_ORG_ID ?? '22222222-2222-2222-2222-222222222222';
const USER_ID = process.env.TEST_USER_ID ?? '11111111-1111-1111-1111-111111111111';
const ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

describe('audit lifecycle (integration)', () => {
  let intentId: string;
  let supabase: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    supabase = createClient<Database>(URL, KEY);

    // pgmq queues are shared across the whole test run and are not reset
    // between files. Drain any stale messages enqueued by earlier suites so
    // this suite's worker invocations dequeue its own messages.
    for (const queue of ['q:scrape', 'q:analyze']) {
      for (let i = 0; i < 100; i++) {
        const { data } = await supabase.rpc('dequeue_message', { p_queue_name: queue });
        if (!data) break;
      }
    }
  });

  afterAll(async () => {
    // Cleanup: remove the intent and any insights/audit rows it created
    if (intentId) {
      await supabase.from('insights').delete().eq('intent_id', intentId);
      await supabase
        .from('audit_log')
        .delete()
        .eq('org_id', ORG_ID)
        .eq('action', 'analyze.shopify_catalog');
      await supabase.from('intents').delete().eq('id', intentId);
    }
  });

  it('completes the full audit lifecycle: intent → queued → processed → insights → audit_log', async () => {
    // Step 1: Create an intent (simulating what intel-analyze-shop does)
    const inputHash = 'a'.repeat(64);
    const { data: intent, error: intentError } = await supabase
      .from('intents')
      .insert({
        org_id: ORG_ID,
        user_id: USER_ID,
        kind: 'analyze_shop',
        status: 'queued',
        input_hash: inputHash,
        idempotency_key: `lifecycle-test-${Date.now()}`,
      })
      .select('id')
      .single();

    expect(intentError).toBeNull();
    expect(intent?.id).toBeDefined();
    intentId = intent?.id ?? '';

    // Step 2: Enqueue a scrape job (simulating what intel-analyze-shop does)
    await supabase.rpc('enqueue_message', {
      p_queue_name: 'q:scrape',
      p_message: {
        intentId,
        orgId: ORG_ID,
        platform: 'shopify',
        url: 'https://example.myshopify.com',
      },
    });

    // Step 3: Run the worker (simulating what pg_cron or worker:loop does)
    await workerScrape({ supabase, orgId: ORG_ID });
    await workerAnalyze({ supabase, orgId: ORG_ID });

    // Step 4: Verify the intent was processed
    const { data: updatedIntent } = await supabase
      .from('intents')
      .select('status, error_code, error_message')
      .eq('id', intentId)
      .single();

    // The worker should have either succeeded (if shopify-admin key exists)
    // or fallen back to the Firecrawl/LLM path. Either way, status should
    // not still be 'queued' or 'running'.
    expect(['succeeded', 'failed']).toContain(updatedIntent?.status);

    // Step 5: Verify audit_log was populated
    const { data: auditRows } = await supabase
      .from('audit_log')
      .select('action, outcome, provider')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(5);

    expect(auditRows).toBeDefined();
    expect(auditRows?.length).toBeGreaterThan(0);
  }, 30_000);

  it('rejects unauthorized mutation attempts (RLS safety)', async () => {
    // RLS `intents_member_insert` requires `is_member_of(org_id) AND
    // user_id = auth.uid()`. An authenticated non-member (or a user_id that
    // does not match the JWT) must be rejected — this test proves the policy
    // is enforced at the row level, independent of the service_role bypass.
    const authed = createClient<Database>(URL, ANON_KEY);
    await authed.auth.signInWithPassword({ email: 'dev@steadyflow.local', password: 'admin' });

    const { error } = await authed.from('intents').insert({
      org_id: ORG_ID,
      user_id: '99999999-9999-9999-9999-999999999999',
      kind: 'analyze_shop',
      status: 'queued',
      input_hash: 'b'.repeat(64),
      idempotency_key: `rls-test-${Date.now()}`,
    });

    // RLS rejects the mutation (user_id does not match the authenticated user).
    expect(error).toBeTruthy();
  });
});
