import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// In CI, rely on env vars injected by the workflow.
// Locally, prefer .env.test; otherwise fall back to .env.
if (!process.env.CI) {
  if (process.env.NODE_ENV === 'test') config({ path: '.env.test' });
  else if (process.env.NODE_ENV === 'development') config({ path: '.env' });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    isolate: true,
    sequence: { concurrent: false },
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 60_000,
    passWithNoTests: true,
    include: [
      'tests/{integration,e2e,security}/**/*.{test,spec,e2e}.{ts,tsx}',
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
});
