import type { NextConfig } from 'next';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { withWorkflow, withSentryConfig } = vi.hoisted(() => ({
  withWorkflow: vi.fn((config: NextConfig) => config),
  withSentryConfig: vi.fn((config: NextConfig) => config),
}));

vi.mock('workflow/next', () => ({ withWorkflow }));
vi.mock('@sentry/nextjs', () => ({ withSentryConfig }));

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.clearAllMocks();
  vi.resetModules();
});

describe('Next config Workflow initialization', () => {
  it.each([
    '/repo/node_modules/next/dist/telemetry/detached-flush.js',
    'C:\\repo\\node_modules\\next\\dist\\telemetry\\detached-flush.js',
  ])('skips Workflow in the telemetry uploader: %s', async (entrypoint) => {
    process.argv = ['node', entrypoint, 'dev', '/repo', '_events_123.json'];

    const { default: config } = await import('../../../next.config');

    expect(withWorkflow).not.toHaveBeenCalled();
    expect(withSentryConfig).toHaveBeenCalledWith(config, expect.any(Object));
    expect(config).toMatchObject({ reactCompiler: true });
  });

  it.each(['dev', 'build', 'start'])(
    'retains Workflow for next %s',
    async (command) => {
      process.argv = ['node', '/repo/node_modules/next/dist/bin/next', command];

      await import('../../../next.config');

      expect(withWorkflow).toHaveBeenCalledOnce();
      expect(withSentryConfig).toHaveBeenCalledOnce();
    },
  );
});
