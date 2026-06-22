import { workflowTransformPlugin } from '@workflow/rollup';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcRoot = fileURLToPath(new URL('./src', import.meta.url));
const testsRoot = fileURLToPath(new URL('./tests', import.meta.url));
const supabaseRoot = fileURLToPath(new URL('./supabase', import.meta.url));

export default defineConfig({
  plugins: [workflowTransformPlugin()],
  test: {
    name: 'workflow',
    globals: true,
    environment: 'node',
    pool: 'threads',
    maxWorkers: 1,
    testTimeout: 60_000,
    include: ['tests/workflow/**/*.workflow.spec.ts'],
    passWithNoTests: false,
    globalSetup: ['tests/setup/workflow-vitest-global-setup.ts'],
    setupFiles: [
      'tests/setup/test-env.ts',
      'tests/setup.ts',
      'tests/setup/db.ts',
      'tests/setup/workflow-vitest-setup.ts',
    ],
    env: {
      AI_PROVIDER: 'mock',
      MOCK_GENERATION_DELAY_MS: '0',
      MOCK_GENERATION_FAILURE_RATE: '0',
      MOCK_GENERATION_SEED: '20260622',
      MOCK_AI_SCENARIO: 'success',
      LESSON_GENERATION_ENABLED: 'true',
      ENABLE_SENTRY: 'false',
      NEXT_PUBLIC_ENABLE_SENTRY: 'false',
    },
    alias: {
      '@': srcRoot,
      '@/': path.join(srcRoot, path.sep),
      '@tests': testsRoot,
      '@tests/': path.join(testsRoot, path.sep),
      '@supabase': supabaseRoot,
      '@supabase/': path.join(supabaseRoot, path.sep),
    },
  },
});
