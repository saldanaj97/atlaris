import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Set test database URL if not provided; use project-specific local port 54322.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
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
