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
    setupFiles: ['tests/setup/workflow-vitest-setup.ts'],
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
