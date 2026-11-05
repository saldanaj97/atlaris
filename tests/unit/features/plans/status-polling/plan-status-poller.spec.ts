import { PlanStatusPoller } from '@/features/plans/status-polling/plan-status-poller';
import {
  createMockFetchResponse,
  createPlanStatusResponse,
} from '@tests/fixtures/plan-status';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Node's `fetch` ignores `this`, but a browser's rejects anything other than
 * the global object or `undefined`. This double applies the browser's check.
 */
function createBrowserLikeFetch(): typeof fetch {
  return function (this: unknown) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError(
        "Failed to execute 'fetch' on 'Window': Illegal invocation",
      );
    }
    return Promise.resolve(
      createMockFetchResponse(
        createPlanStatusResponse({ status: 'ready', attempts: 1 }),
      ),
    );
  } as unknown as typeof fetch;
}

describe('PlanStatusPoller', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    {
      source: 'an injected fetcher',
      config: () => ({ fetcher: createBrowserLikeFetch() }),
    },
    {
      source: 'the default global fetch',
      config: () => {
        vi.stubGlobal('fetch', createBrowserLikeFetch());
        return {};
      },
    },
  ])('calls $source the way a browser accepts', async ({ config }) => {
    const poller = new PlanStatusPoller({
      planId: 'plan-123',
      initialStatus: 'pending',
      ...config(),
    });

    await poller.revalidate();

    expect(poller.getSnapshot()).toMatchObject({
      status: 'ready',
      pollingError: null,
      isPolling: false,
    });
    poller.dispose();
  });

  it('does not apply a late fetch response after disposal', async () => {
    type MockFetchResponse = ReturnType<typeof createMockFetchResponse>;

    let resolveFetch!: (response: MockFetchResponse) => void;
    let fetchSignal: AbortSignal | null = null;
    const pendingFetch = new Promise<MockFetchResponse>((resolve) => {
      resolveFetch = resolve;
    });
    const fetcher = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      fetchSignal = init?.signal ?? null;
      return pendingFetch;
    });

    const poller = new PlanStatusPoller({
      planId: 'plan-123',
      initialStatus: 'pending',
      fetcher: fetcher as unknown as typeof fetch,
    });
    const listener = vi.fn();
    poller.subscribe(listener);

    const initialSnapshot = poller.getSnapshot();
    poller.start();

    expect(fetcher).toHaveBeenCalledTimes(1);

    poller.dispose();
    expect(fetchSignal).not.toBeNull();
    expect(fetchSignal!.aborted).toBe(true);

    resolveFetch(
      createMockFetchResponse(
        createPlanStatusResponse({ status: 'ready', attempts: 7 }),
      ),
    );
    await pendingFetch;
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    expect(poller.getSnapshot()).toEqual(initialSnapshot);
  });

  it('polls again after restart from a terminal failed status', async () => {
    const fetcher = vi.fn(async () =>
      createMockFetchResponse(
        createPlanStatusResponse({ status: 'ready', attempts: 2 }),
      ),
    );
    const poller = new PlanStatusPoller({
      planId: 'plan-123',
      initialStatus: 'failed',
      fetcher: fetcher as unknown as typeof fetch,
    });
    const snapshots: string[] = [];
    poller.subscribe(() => snapshots.push(poller.getSnapshot().status));

    poller.start();
    await poller.revalidate();
    expect(fetcher).not.toHaveBeenCalled();

    await poller.restart();

    expect(fetcher).toHaveBeenCalledWith('/api/v1/plans/plan-123/status', {
      signal: expect.any(AbortSignal),
    });
    expect(snapshots).toEqual(['failed', 'processing', 'ready']);
    expect(poller.getSnapshot()).toMatchObject({
      status: 'ready',
      attempts: 2,
      isPolling: false,
    });
    poller.dispose();
  });
});
