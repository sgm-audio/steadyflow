import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for SteadyFlow web dashboard E2E tests.
 *
 * Covers the primary workflow: login → dashboard → create intent → see insights.
 * Requires `pnpm dev` running on http://127.0.0.1:3000 and local Supabase on :54321.
 */

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Shared local Supabase — sequential to avoid races
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
