import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// In CI, rely on env vars injected by the workflow.
// Locally, prefer .env.test; otherwise fall back to .env.
if (!process.env.CI) {
  if (process.env.NODE_ENV === 'test') config({ path: '.env.test' });
  else if (process.env.NODE_ENV === 'development') config({ path: '.env' });
}

// Shared alias configuration for test projects
const testAliases = {
  '@/': new URL('./src/', import.meta.url).pathname,
  '@': new URL('./src/', import.meta.url).pathname,
};

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
    },
    projects: [
      {
        test: {
          name: 'integration',
          globals: true,
          environment: 'jsdom',
          isolate: true,
          sequence: { concurrent: false },
          pool: 'threads',
          poolOptions: { threads: { singleThread: true } },
          testTimeout: 90_000,
          // Allow CI shards to pass when filter excludes all files
          passWithNoTests: true,
          include: [
            'tests/{integration,e2e,security}/**/*.{test,spec}.{ts,tsx}',
            // Support *.e2e.ts(x) naming in e2e folder
            'tests/{integration,e2e,security}/**/*.{e2e}.{ts,tsx}',
            'tests/{integration,e2e,security}/**/*.*.test.{ts,tsx}',
          ],
          setupFiles: ['tests/setup.ts'],
          maxConcurrency: 1,
          alias: testAliases,
        },
      },
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          isolate: true,
          sequence: { concurrent: true },
          pool: 'threads',
          testTimeout: 20_000,
          // Avoid failures when filtered runs exclude unit tests
          passWithNoTests: true,
          include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['tests/unit/setup.ts'],
          alias: testAliases,
        },
      },
    ],
  },
});
