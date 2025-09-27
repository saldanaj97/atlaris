import path from 'node:path';

import { defineConfig } from 'vitest/config';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://stub:stub@127.0.0.1:5432/stub';
  if (!process.env.SKIP_DB_TEST_SETUP) {
    process.env.SKIP_DB_TEST_SETUP = 'true';
  }
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
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html'],
    },
  },
});
