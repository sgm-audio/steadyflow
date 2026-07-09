/**
 * Local worker loop.
 *
 * Nothing schedules workers-scrape/workers-analyze/workers-enrich in local
 * dev (no pg_cron, no external scheduler) — queued intents just sit there
 * forever unless something calls the worker functions. This is that
 * something: poll all three queues on an interval until Ctrl+C.
 *
 * Usage: pnpm worker:loop   (from apps/edge)
 * Env:   WORKER_ORG_ID (default: seeded Dev Org), WORKER_POLL_MS (default: 2000)
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@steadyflow/db';
import { workerScrape, workerEnrich, workerAnalyze, type WorkerCtx } from '../src/workers.js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const ORG_ID = process.env.WORKER_ORG_ID ?? '22222222-2222-2222-2222-222222222222';
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);

const supabase = createClient<Database>(URL, KEY);
const ctx: WorkerCtx = { supabase, orgId: ORG_ID };

let running = true;
const stop = (): void => {
  running = false;
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const countIntents = async (status: string): Promise<number> => {
  const { count } = await supabase
    .from('intents')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', ORG_ID)
    .eq('status', status);
  return count ?? 0;
};

const tick = async (): Promise<void> => {
  const before = await countIntents('queued');
  await workerScrape(ctx);
  await workerEnrich(ctx);
  await workerAnalyze(ctx);
  const after = await countIntents('queued');
  const succeeded = await countIntents('succeeded');
  if (before !== after || succeeded > 0) {
    console.log(`[worker-loop] queued=${after} succeeded=${succeeded}`);
  }
};

console.log(`[worker-loop] polling q:scrape/q:enrich/q:analyze every ${POLL_MS}ms (org ${ORG_ID}). Ctrl+C to stop.`);

while (running) {
  try {
    await tick();
  } catch (err) {
    console.error('[worker-loop] tick failed:', err);
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

console.log('[worker-loop] stopped.');
