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
    sequence: { concurrent: true },
    pool: 'threads',
    testTimeout: 20_000,
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/unit',
      reporter: ['text', 'html'],
    },
  },
});
