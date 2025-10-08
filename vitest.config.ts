import path from 'node:path';

import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load .env.test for all test runs
config({ path: '.env.test' });

if (!process.env.DATABASE_URL) {
  console.error(
    'Error: DATABASE_URL is not set. Please set a proper DATABASE_URL for testing.'
  );
  process.exit(1);
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    // Use jsdom so we can test React hooks/components
    environment: 'jsdom',
    // Ensure each test file runs in isolated VM to prevent mock/env bleed
    isolate: true,
    // Run tests strictly sequentially across files
    sequence: { concurrent: false },
    // Use a single worker to avoid cross-file env/mocks conflicts
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 20_000,
    // Include TS and TSX tests
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    // Integration tests share a single Postgres instance; keep file-level concurrency at 1.
    maxConcurrency: 1,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
    },
  },
});
