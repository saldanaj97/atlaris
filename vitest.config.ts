import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// In CI, rely on env vars injected by the workflow.
// Locally, prefer .env.test; otherwise fall back to .env.
if (!process.env.CI) {
  if (process.env.NODE_ENV === 'test') config({ path: '.env.test' });
  else if (process.env.NODE_ENV === 'development') config({ path: '.env' });
}

// Shared alias configuration for test projects
const srcRoot = fileURLToPath(new URL('./src', import.meta.url));
const testAliases = {
  '@': srcRoot,
  '@/': path.join(srcRoot, path.sep),
} as const;

export default defineConfig({
  test: {
    // Allow CI shards to pass when the filter excludes all files
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'json', 'lcov'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
        'dist/**',
        '.next/**',
      ],
      all: true,
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70,
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
          include: [
            'tests/{integration,e2e,security}/**/*.{test,spec}.{ts,tsx}',
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
          include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['tests/unit/setup.ts'],
          alias: testAliases,
        },
      },
    ],
  },
});
