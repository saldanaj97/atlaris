import { act, renderHook } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { usePlanStatus } from '@/hooks/usePlanStatus';

// Helper to flush timers in jsdom environment
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('usePlanStatus', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.useRealTimers();
    (global.fetch as any) = originalFetch;
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
    (global.fetch as unknown as Mock).mockImplementation(() => {
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
          }
        )
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

    const fetchCallsAfterReady = (global.fetch as Mock).mock.calls.length;

    guard = 0;
    while (guard++ < 60) {
      await advance(100);
    }

    expect((global.fetch as Mock).mock.calls.length).toBe(fetchCallsAfterReady);
    expect(result.current.isPolling).toBe(false);
  });

  it('T051 sets error and stops when failed', async () => {
    // First two polls return processing (Strict Mode may run two immediate polls);
    // the next poll returns failed.
    let callCount = 0;
    (global.fetch as unknown as Mock).mockImplementation(() => {
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
        })
      );
    });

    const { result } = renderHook(() =>
      usePlanStatus('plan-err', 'processing')
    );

    // Initial state
    expect(result.current.status).toBe('processing');

    await advance(3000);
    if (result.current.status !== 'failed') {
      await advance(3000);
    }
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Provider timeout');

    const fetchCallsAfterFail = (global.fetch as Mock).mock.calls.length;
    await advance(6000);
    expect((global.fetch as Mock).mock.calls.length).toBe(fetchCallsAfterFail);
    expect(result.current.isPolling).toBe(false);
  });

  it('T052 does not poll when initial status is ready', async () => {
    const fetchSpy = global.fetch as Mock;
    renderHook(() => usePlanStatus('plan-ready', 'ready'));
    await advance(6000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('T052 does not poll when initial status is failed', async () => {
    const fetchSpy = global.fetch as Mock;
    renderHook(() => usePlanStatus('plan-failed', 'failed'));
    await advance(6000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
// light subset
