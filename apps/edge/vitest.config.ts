import { defineConfig } from 'vitest/config';
import { loadRootEnvLocal } from './load-root-env.js';

loadRootEnvLocal();

// Integration suites need a live `supabase start` on :54321. CI does not
// boot local Postgres, so skip those files there; unit/fuzz tests still run.
// Also skip when service-role is unset so missing local secrets don't abort
// collection of unrelated unit tests.
const integrationTests = [
  'src/handlers.test.ts',
  'src/workers.test.ts',
  'src/rls-security.test.ts',
];

const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const skipIntegration = Boolean(process.env.CI) || !hasServiceRole;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: skipIntegration ? integrationTests : [],
    globalSetup: skipIntegration ? undefined : ['./vitest.global-setup.ts'],
    // Integration tests hit one shared live Postgres instance - running
    // files concurrently causes cross-file state races (leaked rows,
    // dequeue races on pgmq queues). Force sequential file execution.
    fileParallelism: false,
    env: {
      SUPABASE_URL: 'http://127.0.0.1:54321',
      // Pass through after loadRootEnvLocal(); never hardcode a default.
      ...(hasServiceRole
        ? { SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string }
        : {}),
      TEST_USER_ID: '11111111-1111-1111-1111-111111111111',
      TEST_ORG_ID: '22222222-2222-2222-2222-222222222222',
    },
  },
});
