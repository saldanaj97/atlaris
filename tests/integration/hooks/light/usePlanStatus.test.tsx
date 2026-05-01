import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanStatus } from '@/hooks/usePlanStatus';

// Helper to flush timers in jsdom environment
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('usePlanStatus', () => {
  const getFetchMock = () => vi.mocked(globalThis.fetch);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn() as typeof fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('T050 transitions pending -> processing -> ready and stops polling', async () => {
    // Strict Mode may run the polling effect twice on mount (two immediate fetches).
    // Single-mount only has one immediate fetch. Use a long enough sequence and an
    // extra advance when still pending so both layouts reach `processing` then `ready`.
    // Duplicate `processing` so a single event-loop turn cannot skip the state
    // when multiple polls resolve back-to-back.
    const statusSequence: Array<'pending' | 'processing' | 'ready'> = [
      'pending',
      'pending',
      'processing',
      'processing',
      'ready',
    ];
    let fetchIndex = 0;
    getFetchMock().mockImplementation(() => {
      const at = Math.min(fetchIndex, statusSequence.length - 1);
      const status = statusSequence[at] ?? 'ready';
      fetchIndex += 1;
      const attempts = status === 'pending' ? 0 : 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            planId: 'plan-1',
            status,
            attempts,
            latestError: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
    });

    const { result } = renderHook(() => usePlanStatus('plan-1', 'pending'));

    // Initial state reflects the provided initialStatus
    expect(result.current.status).toBe('pending');

    // Small steps avoid skipping `processing` when fake timers coalesce long advances
    let guard = 0;
    while (result.current.status === 'pending' && guard++ < 120) {
      await advance(100);
    }
    expect(guard).toBeLessThan(120); // sanity: ensure we didn't timeout waiting for processing
    expect(result.current.status).toBe('processing');

    guard = 0;
    while (result.current.status === 'processing' && guard++ < 120) {
      await advance(100);
    }
    expect(guard).toBeLessThan(120); // sanity: ensure we didn't timeout waiting for ready
    expect(result.current.status).toBe('ready');

    const fetchCallsAfterReady = getFetchMock().mock.calls.length;

    guard = 0;
    while (guard++ < 60) {
      await advance(100);
    }

    expect(getFetchMock().mock.calls.length).toBe(fetchCallsAfterReady);
    expect(result.current.isPolling).toBe(false);
  });

  it('T051 sets error and stops when failed', async () => {
    // First two polls return processing (Strict Mode may run two immediate polls);
    // the next poll returns failed.
    let callCount = 0;
    getFetchMock().mockImplementation(() => {
      callCount += 1;
      const body =
        callCount <= 2
          ? {
              planId: 'plan-err',
              status: 'processing',
              attempts: 1,
              latestError: null,
            }
          : {
              planId: 'plan-err',
              status: 'failed',
              attempts: 2,
              latestError: 'Provider timeout',
            };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const { result } = renderHook(() =>
      usePlanStatus('plan-err', 'processing'),
    );

    // Initial state
    expect(result.current.status).toBe('processing');

    await advance(3000);
    if (result.current.status !== 'failed') {
      await advance(3000);
    }
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Provider timeout');

    const fetchCallsAfterFail = getFetchMock().mock.calls.length;
    await advance(6000);
    expect(getFetchMock().mock.calls.length).toBe(fetchCallsAfterFail);
    expect(result.current.isPolling).toBe(false);
  });

  it('T052 does not poll when initial status is ready', async () => {
    const fetchSpy = getFetchMock();
    renderHook(() => usePlanStatus('plan-ready', 'ready'));
    await advance(6000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('T052 does not poll when initial status is failed', async () => {
    const fetchSpy = getFetchMock();
    renderHook(() => usePlanStatus('plan-failed', 'failed'));
    await advance(6000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('T053 stops polling after repeated retriable HTTP failures', async () => {
    let calls = 0;
    getFetchMock().mockImplementation(() => {
      calls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: 'upstream unavailable',
            code: 'BAD_GATEWAY',
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    const { result } = renderHook(() =>
      usePlanStatus('plan-upstream', 'pending'),
    );

    let guard = 0;
    while (result.current.pollingError === null && guard++ < 200) {
      await advance(250);
    }

    expect(result.current.pollingError).toContain('upstream');
    expect(result.current.isPolling).toBe(false);
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
// light subset
