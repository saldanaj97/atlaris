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
    testTimeout: 20_000,
    // Include TS and TSX tests
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    // Integration tests share a single Postgres instance; limit concurrency to avoid cross-test truncation.
    maxConcurrency: 1,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
    },
  },
});
