import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Set test database URL if not provided; use project-specific local port 54322.
if (!process.env.DATABASE_URL) {
  const dbUser = process.env.TEST_DB_USER || 'test_user';
  const dbPass = process.env.TEST_DB_PASS || 'test_pass';
  process.env.DATABASE_URL = `postgresql://${dbUser}:${dbPass}@127.0.0.1:54322/postgres`;
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
    // Include TS and TSX tests
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
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
