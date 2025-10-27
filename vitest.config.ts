import path from 'node:path';

import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// In CI, rely on env vars injected by the workflow.
// Locally, prefer .env.test; otherwise fall back to .env.
if (!process.env.CI) {
  if (process.env.NODE_ENV === 'test') config({ path: '.env.test' });
  else if (process.env.NODE_ENV === 'development') config({ path: '.env' });
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    projects: [
      {
        name: 'integration',
        test: {
          globals: true,
          environment: 'jsdom',
          isolate: true,
          sequence: { concurrent: false },
          pool: 'threads',
          poolOptions: { threads: { singleThread: true } },
          testTimeout: 20_000,
          include: [
            'tests/{integration,e2e,security}/**/*.{test,spec}.{ts,tsx}',
            'src/**/*.{test,spec}.{ts,tsx}',
          ],
          setupFiles: ['tests/setup.ts'],
          maxConcurrency: 1,
          coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage/integration',
            reporter: ['text', 'html'],
          },
        },
      },
      {
        name: 'unit',
        test: {
          globals: true,
          environment: 'jsdom',
          isolate: true,
          sequence: { concurrent: true },
          pool: 'forks',
          workers: 4,
          testTimeout: 20_000,
          include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['tests/unit/setup.ts'],
          coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage/unit',
            reporter: ['text', 'html'],
          },
        },
      },
    ],
  },
});
