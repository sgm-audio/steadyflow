import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.TEST_ORG_ID ?? '22222222-2222-2222-2222-222222222222';

/**
 * Integration tests share one live local Postgres instance and the seeded
 * dev org. Wipe org-scoped mutable rows once before the whole run so tests
 * don't see data leaked from a previous run (assertions like `toEqual([])`
 * assume a pristine baseline: seed org/user/membership only).
 */
export default async function setup(): Promise<void> {
  if (!KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for integration tests (set via env / .env.local; fail closed — no hardcoded default)',
    );
  }
  const supabase = createClient(URL, KEY);
  await supabase.from('insights').delete().eq('org_id', ORG_ID);
  await supabase.from('sources').delete().eq('org_id', ORG_ID);
  await supabase.from('intents').delete().eq('org_id', ORG_ID);
  await supabase.from('audit_log').delete().eq('org_id', ORG_ID);
  await supabase.from('keys_envelopes').delete().eq('org_id', ORG_ID);
}
