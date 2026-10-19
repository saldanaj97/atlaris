import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// In CI, rely on env vars injected by the workflow.
// Locally, prefer .env.test; otherwise fall back to .env.
// Use override: true to force .env.test values even if env vars are already set in shell
if (!process.env.CI) {
  const envPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  if (existsSync(envPath)) {
    if (process.env.NODE_ENV === 'test') {
      Object.assign(process.env, parseEnv(readFileSync(envPath, 'utf8')));
    } else {
      process.loadEnvFile(envPath);
    }
  }
}

// Shared alias configuration for test projects
const srcRoot = fileURLToPath(new URL('./src', import.meta.url));
const testsRoot = fileURLToPath(new URL('./tests', import.meta.url));
const supabaseRoot = fileURLToPath(new URL('./supabase', import.meta.url));
const authServerMockPath = fileURLToPath(
  new URL('./tests/mocks/shared/auth-server.ts', import.meta.url),
);
const testAliases = {
  '@/lib/auth/server': authServerMockPath,
  '@': srcRoot,
  '@/': path.join(srcRoot, path.sep),
  '@tests': testsRoot,
  '@tests/': path.join(testsRoot, path.sep),
  '@supabase': supabaseRoot,
  '@supabase/': path.join(supabaseRoot, path.sep),
  'next/headers': 'next/headers.js',
} as const;

const integrationMaxWorkers = getIntegrationMaxWorkers();

// CircleCI Smarter Testing analysis: `CIRCLECI_COVERAGE=<file>` turns on the
// per-test V8 coverage runner/reporter from @circleci/vitest-circleci-coverage.
// Per-test coverage needs tests to run one at a time inside a file, so the unit
// projects drop `sequence.concurrent` while analysis is on.
const circleciCoverage = process.env.CIRCLECI_COVERAGE !== undefined;
const circleciCoverageRunner = circleciCoverage
  ? { runner: '@circleci/vitest-circleci-coverage/runner' }
  : {};

function getIntegrationMaxWorkers(): number {
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
    ...(circleciCoverage
      ? { reporters: ['@circleci/vitest-circleci-coverage/reporter'] }
      : {}),
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
          // Override with INTEGRATION_MAX_WORKERS.
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
          ...circleciCoverageRunner,
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
      // Unit tests are split by environment: `.ts` specs run in plain Node
      // (no jsdom, no React Testing Library), `.tsx` specs run in jsdom.
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          isolate: true,
          sequence: { concurrent: !circleciCoverage, groupOrder: 0 },
          pool: 'threads',
          testTimeout: 20_000,
          include: ['tests/unit/**/*.{test,spec}.ts'],
          setupFiles: ['tests/unit/setup.node.ts'],
          alias: testAliases,
          ...circleciCoverageRunner,
        },
      },
      {
        test: {
          name: 'unit-dom',
          globals: true,
          environment: 'jsdom',
          isolate: true,
          sequence: { concurrent: !circleciCoverage, groupOrder: 0 },
          pool: 'threads',
          testTimeout: 20_000,
          include: ['tests/unit/**/*.{test,spec}.tsx'],
          setupFiles: ['tests/unit/setup.ts'],
          alias: testAliases,
          ...circleciCoverageRunner,
        },
      },
    ],
  },
});
