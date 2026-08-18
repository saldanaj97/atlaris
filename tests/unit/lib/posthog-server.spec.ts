import { afterEach, describe, expect, it, vi } from 'vitest';

const { afterMock, captureMock, flushMock } = vi.hoisted(() => ({
  afterMock: vi.fn<(task: () => void | Promise<void>) => void>(),
  captureMock: vi.fn(),
  flushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/server', () => ({
  after: afterMock,
}));

vi.mock('posthog-node', () => ({
  PostHog: class {
    capture = captureMock;
    flush = flushMock;
  },
}));

import { captureAfterResponse } from '@/lib/posthog-server';

describe('captureAfterResponse', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('schedules capture+flush with Clerk authUserId and does not flush on the call path', async () => {
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
});
