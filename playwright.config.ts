import { defineConfig } from '@playwright/test';

const SMOKE_ANON_BASE_URL = 'http://127.0.0.1:3100';
const SMOKE_AUTH_BASE_URL = 'http://127.0.0.1:3101';
const PLAYWRIGHT_REPORT_DIR = './tests/test-results/playwright/playwright-report';
const PLAYWRIGHT_OUTPUT_DIR = './tests/test-results/playwright';
const SMOKE_SERVER_TIMEOUT_MS = 180_000;
const SMOKE_SERVER_SHUTDOWN = { signal: 'SIGTERM' as const, timeout: 5_000 };

export default defineConfig({
  testDir: './tests/playwright/smoke',
  timeout: 180_000,
  outputDir: PLAYWRIGHT_OUTPUT_DIR,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: PLAYWRIGHT_REPORT_DIR }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  fullyParallel: false,
  webServer: [
    {
      command: 'pnpm exec tsx scripts/smoke/start-app.ts --mode=anon',
      gracefulShutdown: SMOKE_SERVER_SHUTDOWN,
      reuseExistingServer: false,
      timeout: SMOKE_SERVER_TIMEOUT_MS,
      url: SMOKE_ANON_BASE_URL,
    },
    {
      command: 'pnpm exec tsx scripts/smoke/start-app.ts --mode=auth',
      gracefulShutdown: SMOKE_SERVER_SHUTDOWN,
      reuseExistingServer: false,
      timeout: SMOKE_SERVER_TIMEOUT_MS,
      url: SMOKE_AUTH_BASE_URL,
    },
  ],
  projects: [
    {
      name: 'smoke-anon',
      testMatch: /anon\.redirects\.spec\.ts/,
      use: {
        baseURL: SMOKE_ANON_BASE_URL,
      },
    },
    {
      name: 'smoke-auth',
      testMatch: /auth\..*\.spec\.ts/,
      workers: 1,
      use: {
        baseURL: SMOKE_AUTH_BASE_URL,
      },
    },
  ],
});
