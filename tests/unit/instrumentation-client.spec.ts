import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { posthogInitMock, sentryInitMock } = vi.hoisted(() => ({
  posthogInitMock: vi.fn(),
  sentryInitMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureRouterTransitionStart: vi.fn(),
  init: sentryInitMock,
  replayIntegration: vi.fn(() => ({})),
}));

vi.mock('posthog-js', () => ({
  default: { init: posthogInitMock },
}));

async function loadInstrumentationClient() {
  vi.resetModules();
  await import('@/instrumentation-client');
}

describe('client PostHog instrumentation', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_TARGET_ENV', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('does not initialize PostHog in a Vercel Preview deployment', async () => {
    await loadInstrumentationClient();

    expect(posthogInitMock).not.toHaveBeenCalled();
  });

  it('initializes PostHog in an explicit Vercel Production deployment', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');

    await loadInstrumentationClient();

    expect(posthogInitMock).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: '/ingest' }),
    );
  });
});
