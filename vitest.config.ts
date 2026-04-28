import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// In CI, rely on env vars injected by the workflow.
// Locally, prefer .env.test; otherwise fall back to .env.
// Use override: true to force .env.test values even if env vars are already set in shell
if (!process.env.CI) {
  if (process.env.NODE_ENV === 'test')
    config({ path: '.env.test', override: true });
  else config({ path: '.env' });
}

// Shared alias configuration for test projects
const srcRoot = fileURLToPath(new URL('./src', import.meta.url));
const testsRoot = fileURLToPath(new URL('./tests', import.meta.url));
const authServerMockPath = fileURLToPath(
  new URL('./tests/mocks/shared/auth-server.ts', import.meta.url),
);
const testAliases = {
  '@/lib/auth/server': authServerMockPath,
  '@': srcRoot,
  '@/': path.join(srcRoot, path.sep),
  '@tests': testsRoot,
  '@tests/': path.join(testsRoot, path.sep),
  'next/headers': 'next/headers.js',
} as const;

const integrationMaxWorkers = getIntegrationMaxWorkers();

function getIntegrationMaxWorkers(): number {
  if (process.env.SKIP_TESTCONTAINERS === 'true') {
    return 1;
  }

  const configured = Number.parseInt(
    process.env.INTEGRATION_MAX_WORKERS ?? '4',
    10,
  );

  return Number.isFinite(configured) && configured > 0 ? configured : 4;
}

export default defineConfig({
  test: {
    // Allow CI shards to pass when the filter excludes all files
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'json', 'lcov'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
        'dist/**',
        '.next/**',
      ],
      thresholds: {
        lines: 0,
        branches: 0,
        statements: 0,
      },
    },
    projects: [
      {
        test: {
          name: 'integration',
          globals: true,
          environment: 'jsdom',
          isolate: true,
          sequence: { concurrent: false, groupOrder: 1 },
          // Vitest 4 defaults to multi-process `forks` with per-file isolation; we set this
          // explicitly so the integration project intent does not silently change if defaults
          // shift in a future minor. See tests/setup/test-env.ts for per-worker DB provisioning.
          pool: 'forks',
          // Integration defaults to 4 workers; test-env provisions one cloned DB per Vitest worker.
          // Override with INTEGRATION_MAX_WORKERS; SKIP_TESTCONTAINERS forces 1 worker.
          maxWorkers: integrationMaxWorkers,
          testTimeout: 90_000,
          include: ['tests/integration/**/*.{test,spec}.{ts,tsx}'],
          globalSetup: ['tests/setup/testcontainers.ts'],
          setupFiles: [
            'tests/setup/test-env.ts',
            'tests/setup.ts',
            'tests/setup/db.ts',
          ],
          maxConcurrency: 1,
          alias: testAliases,
        },
      },
      {
        test: {
          name: 'e2e',
          globals: true,
          environment: 'jsdom',
          isolate: true,
          sequence: { concurrent: false, groupOrder: 3 },
          pool: 'threads',
          maxWorkers: 1,
          testTimeout: 90_000,
          include: ['tests/e2e/**/*.{test,spec}.{ts,tsx}'],
          globalSetup: ['tests/setup/testcontainers.ts'],
          setupFiles: [
            'tests/setup/test-env.ts',
            'tests/setup.ts',
            'tests/setup/db.ts',
          ],
          maxConcurrency: 1,
          alias: testAliases,
        },
      },
      {
        test: {
          name: 'security',
          globals: true,
          environment: 'jsdom',
          isolate: true,
          sequence: { concurrent: false, groupOrder: 2 },
          pool: 'threads',
          maxWorkers: 1,
          testTimeout: 90_000,
          include: ['tests/security/**/*.{test,spec}.{ts,tsx}'],
          globalSetup: ['tests/setup/testcontainers.ts'],
          setupFiles: ['tests/setup/test-env.ts', 'tests/setup.ts'],
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
          sequence: { concurrent: true, groupOrder: 0 },
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
