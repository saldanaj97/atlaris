import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { afterMock, captureMock, flushMock, posthogCtorMock } = vi.hoisted(
  () => ({
    afterMock: vi.fn<(task: () => void | Promise<void>) => void>(),
    captureMock: vi.fn(),
    flushMock: vi.fn().mockResolvedValue(undefined),
    posthogCtorMock: vi.fn(),
  }),
);

vi.mock('next/server', () => ({
  after: afterMock,
}));

vi.mock('posthog-node', () => ({
  PostHog: class {
    constructor(token: string, options: { host: string }) {
      posthogCtorMock(token, options);
    }
    capture = captureMock;
    flush = flushMock;
  },
}));

import { captureAfterResponse } from '@/lib/posthog-server';

beforeEach(() => {
  vi.stubEnv('VERCEL_TARGET_ENV', '');
  vi.stubEnv('NEXT_PUBLIC_VERCEL_TARGET_ENV', '');
});

async function loadPostHogServer() {
  vi.resetModules();
  return import('@/lib/posthog-server');
}

describe('captureAfterResponse', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('schedules capture+flush with Clerk authUserId and does not flush on the call path', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');

    const actor = { id: 'db-uuid', authUserId: 'user_clerk_abc' };
    captureAfterResponse(actor, 'plan_deleted', { plan_id: 'plan-1' });

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(captureMock).not.toHaveBeenCalled();
    expect(flushMock).not.toHaveBeenCalled();

    await afterMock.mock.calls[0]?.[0]();

    expect(captureMock).toHaveBeenCalledWith({
      distinctId: 'user_clerk_abc',
      event: 'plan_deleted',
      properties: { plan_id: 'plan-1' },
    });
    expect(flushMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when after() has no Next request scope', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    afterMock.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });

    expect(() =>
      captureAfterResponse({ authUserId: 'user_clerk_abc' }, 'plan_deleted'),
    ).not.toThrow();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('does not schedule or construct PostHog in a Vercel Preview deployment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');

    const { captureAfterResponse: capture } = await loadPostHogServer();
    capture({ authUserId: 'user_clerk_abc' }, 'plan_deleted');

    expect(afterMock).not.toHaveBeenCalled();
    expect(posthogCtorMock).not.toHaveBeenCalled();
  });
});

describe('getPostHogClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('uses EU ingest origin as the Node SDK host for eu.posthog.com', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'eu.posthog.com');

    const { getPostHogClient } = await loadPostHogServer();
    expect(getPostHogClient()).not.toBeNull();

    expect(posthogCtorMock).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ host: 'https://eu.i.posthog.com' }),
    );
  });

  it('inits with US Cloud ingest when the token is set and host is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '');

    const { getPostHogClient } = await loadPostHogServer();
    expect(getPostHogClient()).not.toBeNull();

    expect(posthogCtorMock).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ host: 'https://us.i.posthog.com' }),
    );
  });

  it('inits with US Cloud ingest when the token is set and host is invalid', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'not a host');

    const { getPostHogClient } = await loadPostHogServer();
    expect(getPostHogClient()).not.toBeNull();

    expect(posthogCtorMock).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ host: 'https://us.i.posthog.com' }),
    );
  });

  it('does not init without a project token', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', '');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://us.posthog.com');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getPostHogClient } = await loadPostHogServer();
    expect(getPostHogClient()).toBeNull();
    expect(posthogCtorMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
