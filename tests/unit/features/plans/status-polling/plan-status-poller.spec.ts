import { PlanStatusPoller } from '@/features/plans/status-polling/plan-status-poller';
import {
  createMockFetchResponse,
  createPlanStatusResponse,
} from '@tests/fixtures/plan-status';
import { describe, expect, it, vi } from 'vitest';

describe('PlanStatusPoller', () => {
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
