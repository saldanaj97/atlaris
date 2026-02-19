import { usePlanStatus } from '@/hooks/usePlanStatus';
import { act, renderHook } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

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
    const responses = [
      { planId: 'plan-1', status: 'pending', attempts: 0, latestError: null },
      {
        planId: 'plan-1',
        status: 'processing',
        attempts: 1,
        latestError: null,
      },
      { planId: 'plan-1', status: 'ready', attempts: 1, latestError: null },
    ];
    (global.fetch as unknown as Mock).mockImplementation(() => {
      const next = responses.shift() ?? responses[responses.length - 1];
      return Promise.resolve(
        new Response(JSON.stringify(next), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const { result } = renderHook(() => usePlanStatus('plan-1', 'pending'));

    // Initial state reflects the provided initialStatus
    expect(result.current.status).toBe('pending');

    // Advance 3s to trigger second poll -> processing
    await advance(3000);
    expect(result.current.status).toBe('processing');

    // Advance 3s to trigger third poll -> ready
    await advance(3000);
    expect(result.current.status).toBe('ready');

    const fetchCallsAfterReady = (global.fetch as Mock).mock.calls.length;

    // Advance more time; should not poll after terminal state
    await advance(6000);

    expect((global.fetch as Mock).mock.calls.length).toBe(fetchCallsAfterReady);
    expect(result.current.isPolling).toBe(false);
  });

  it('T051 sets error and stops when failed', async () => {
    const responses = [
      {
        planId: 'plan-err',
        status: 'processing',
        attempts: 1,
        latestError: null,
      },
      {
        planId: 'plan-err',
        status: 'failed',
        attempts: 2,
        latestError: 'Provider timeout',
      },
    ];
    (global.fetch as unknown as Mock).mockImplementation(() => {
      const next = responses.shift() ?? responses[responses.length - 1];
      return Promise.resolve(
        new Response(JSON.stringify(next), {
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

    // Next tick -> failed
    await advance(3000);
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
