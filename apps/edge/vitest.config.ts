import { defineConfig } from 'vitest/config';
import { createClient } from '@supabase/supabase-js';

// Integration suites need a live `supabase start` on :54321.
const integrationTests = [
  'src/e2e-audit-lifecycle.test.ts',
  'src/handlers.test.ts',
  'src/workers.test.ts',
  'src/rls-security.test.ts',
  'src/audit-lifecycle.test.ts',
];

// Check if local Supabase is reachable
async function isSupabaseAvailable(): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
      { db: { schema: 'public' } },
    );
    const { error } = await supabase.from('orgs').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

export default defineConfig(async () => {
  const skipIntegration = process.env.CI ? true : !(await isSupabaseAvailable());

  return {
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: skipIntegration ? integrationTests : [],
      globalSetup: skipIntegration ? undefined : ['./vitest.global-setup.ts'],
      // Integration tests hit one shared live Postgres instance — running
      // files concurrently causes cross-file state races (leaked rows,
      // dequeue races on pgmq queues). Force sequential file execution.
      fileParallelism: false,
      env: {
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
        TEST_USER_ID: '11111111-1111-1111-1111-111111111111',
        TEST_ORG_ID: '22222222-2222-2222-2222-222222222222',
      },
    },
  };
});
