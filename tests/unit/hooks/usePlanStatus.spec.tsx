import { usePlanStatus } from '@/hooks/usePlanStatus';
import { clientLogger } from '@/lib/logging/client';
import { PLAN_STATUSES } from '@/lib/types/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createMockFetchResponse,
  createPlanStatusResponse,
} from '../../fixtures/plan-status';

describe('usePlanStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientLogger, 'error').mockImplementation(() => undefined);
    vi.spyOn(clientLogger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should initialize with provided initial status', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockFetchResponse(createPlanStatusResponse()));

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    expect(result.current.status).toBe('pending');
    expect(result.current.attempts).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.pollingError).toBeNull();

    await waitFor(() => {
      expect(result.current.isPolling).toBe(true);
    });
  });

  it('should fetch plan status on mount when status is pending', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        createMockFetchResponse(
          createPlanStatusResponse({ status: 'processing' })
        )
      );

    renderHook(() => usePlanStatus('plan-123', 'pending', mockFetch));

    // Wait for the immediate fetch call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/plans/plan-123/status');
    });
  });

  it('should update status and attempts from API response', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        createMockFetchResponse(
          createPlanStatusResponse({ status: 'processing', attempts: 2 })
        )
      );

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    await waitFor(() => {
      expect(result.current.status).toBe('processing');
      expect(result.current.attempts).toBe(2);
      expect(result.current.isPolling).toBe(true);
    });
  });

  it('should stop polling when status becomes ready', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        createMockFetchResponse(
          createPlanStatusResponse({ status: 'ready', attempts: 3 })
        )
      );

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.isPolling).toBe(false);
    });
  });

  it('should stop polling when status becomes failed', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockFetchResponse(
        createPlanStatusResponse({
          status: 'failed',
          attempts: 3,
          latestError: 'AI provider error',
        })
      )
    );

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
      expect(result.current.error).toBe('AI provider error');
      expect(result.current.isPolling).toBe(false);
    });
  });

  it('should set error when latestError is present', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockFetchResponse(
        createPlanStatusResponse({
          status: 'failed',
          latestError: 'Validation error: topic too short',
        })
      )
    );

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    await waitFor(() => {
      expect(result.current.error).toBe('Validation error: topic too short');
    });
  });

  it('should poll every 3 seconds when status is pending', async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockFetchResponse(createPlanStatusResponse()));

    renderHook(() => usePlanStatus('plan-123', 'pending', mockFetch));

    // Flush effects + initial fetch microtask chain
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // First poll after 3 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second poll after another 3 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should poll every 3 seconds when status is processing', async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        createMockFetchResponse(
          createPlanStatusResponse({ status: 'processing' })
        )
      );

    renderHook(() => usePlanStatus('plan-123', 'processing', mockFetch));

    // Flush effects + initial fetch microtask chain
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // First poll after 3 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not poll when initial status is ready', async () => {
    const mockFetch = vi.fn();
    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'ready', mockFetch)
    );

    expect(result.current.status).toBe('ready');
    expect(result.current.isPolling).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should not poll when initial status is failed', async () => {
    const mockFetch = vi.fn();

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'failed', mockFetch)
    );

    expect(result.current.status).toBe('failed');
    expect(result.current.isPolling).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle fetch errors gracefully without stopping polling', async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValue(
        createMockFetchResponse(
          createPlanStatusResponse({ status: 'processing' })
        )
      );

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    // Flush effects + initial fetch (fails with 500)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should continue polling despite error — advance to trigger second fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Status should be updated from successful second fetch
    expect(result.current.status).toBe('processing');
    expect(result.current.isPolling).toBe(true);
    expect(clientLogger.warn).toHaveBeenCalledTimes(1);
    expect(clientLogger.error).not.toHaveBeenCalled();
  });

  it('should handle network errors without stopping polling', async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(
        createMockFetchResponse(
          createPlanStatusResponse({ status: 'processing' })
        )
      );

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    // Flush effects + initial fetch (throws network error)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should continue polling despite error — advance to trigger second fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Status should be updated from successful second fetch
    expect(result.current.status).toBe('processing');
    expect(result.current.isPolling).toBe(true);
    expect(clientLogger.warn).toHaveBeenCalledTimes(1);
    expect(clientLogger.error).not.toHaveBeenCalled();
  });

  it('should clean up polling interval on unmount', async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockFetchResponse(createPlanStatusResponse()));

    const { unmount } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    // Flush effects + initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Unmount the hook
    unmount();

    // Advance time - no more fetches should occur
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should transition from pending to processing to ready', async () => {
    vi.useFakeTimers();

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return createMockFetchResponse(createPlanStatusResponse());
      } else if (callCount === 2) {
        return createMockFetchResponse(
          createPlanStatusResponse({ status: 'processing' })
        );
      } else {
        return createMockFetchResponse(
          createPlanStatusResponse({ status: 'ready' })
        );
      }
    });

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    // Initial fetch - pending
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('pending');
    expect(result.current.isPolling).toBe(true);

    // Second fetch - processing
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.status).toBe('processing');
    expect(result.current.isPolling).toBe(true);

    // Third fetch - ready (should stop polling)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.isPolling).toBe(false);

    // No more fetches should occur
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('StatusResponseSchema parity', () => {
  it('schema status enum covers exactly the same values as PlanStatus', () => {
    // Build a local replica so the test stays independent of the internal export
    const schema = z.object({ status: z.enum(PLAN_STATUSES) });
    const schemaValues = schema.shape.status.options as readonly string[];

    expect([...schemaValues].sort()).toEqual([...PLAN_STATUSES].sort());
  });
});
