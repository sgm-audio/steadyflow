import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
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
});
