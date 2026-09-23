import { defineConfig, devices } from '@playwright/test';

/**
 * Real browser E2E against a running admin panel + backend.
 * Prerequisites:
 *   - backend on API (default http://127.0.0.1:3001)
 *   - admin-panel on ADMIN_BASE_URL (default http://127.0.0.1:3000)
 *   - E2E admin user (see scripts/ensure-e2e-admin in backend-nest)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.ADMIN_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ar-SA',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
