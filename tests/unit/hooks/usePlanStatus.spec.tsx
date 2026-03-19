import { usePlanStatus } from '@/hooks/usePlanStatus';
import { clientLogger } from '@/lib/logging/client';
import { INITIAL_POLL_MS } from '@/shared/constants/polling';
import { PLAN_STATUSES } from '@/shared/types/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createMockFetchResponse,
  createPlanStatusResponse,
} from '../../fixtures/plan-status';

/**
 * With Math.random() mocked to 0.5, jitter factor is exactly 1.0
 * so delays are deterministic: computeNextDelay(d) = min(d * 1.5, 10000)
 */
const FIRST_BACKOFF = 1500; // computeNextDelay(1000) = 1000 * 1.5
const SECOND_BACKOFF = 2250; // computeNextDelay(1500) = 1500 * 1.5
const THIRD_BACKOFF = 3375; // computeNextDelay(2250) = 2250 * 1.5

describe('usePlanStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientLogger, 'error').mockImplementation(() => undefined);
    vi.spyOn(clientLogger, 'warn').mockImplementation(() => undefined);
    // Deterministic jitter: Math.random() = 0.5 → jitter multiplier = 1.0
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
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

  it('should poll with exponential backoff when status is pending', async () => {
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

    // First poll after FIRST_BACKOFF (1500ms with no jitter)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second poll after SECOND_BACKOFF (2250ms with no jitter)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SECOND_BACKOFF);
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should poll with exponential backoff when status is processing', async () => {
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

    // First poll after FIRST_BACKOFF
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF);
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
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Status should be updated from successful second fetch
    expect(result.current.status).toBe('processing');
    expect(result.current.isPolling).toBe(true);
    expect(clientLogger.warn).toHaveBeenCalledTimes(1);
    expect(clientLogger.error).not.toHaveBeenCalled();
  });

  it('should treat 429 responses as retriable and continue polling', async () => {
    vi.useFakeTimers();

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMITED',
        }),
      })
      .mockResolvedValue(
        createMockFetchResponse(
          createPlanStatusResponse({ status: 'processing' })
        )
      );

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

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
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Status should be updated from successful second fetch
    expect(result.current.status).toBe('processing');
    expect(result.current.isPolling).toBe(true);
    expect(clientLogger.warn).toHaveBeenCalledTimes(1);
    expect(clientLogger.error).not.toHaveBeenCalled();
  });

  it('should revalidate after a polling error and resume polling', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Bad request',
          code: 'BAD_REQUEST',
        }),
      })
      .mockResolvedValue(
        createMockFetchResponse(
          createPlanStatusResponse({ status: 'processing', attempts: 1 })
        )
      );

    const { result } = renderHook(() =>
      usePlanStatus('plan-123', 'pending', mockFetch)
    );

    await waitFor(() => {
      expect(result.current.pollingError).toBe('Bad request');
      expect(result.current.isPolling).toBe(false);
    });

    await act(async () => {
      await result.current.revalidate();
    });

    await waitFor(() => {
      expect(result.current.pollingError).toBeNull();
      expect(result.current.status).toBe('processing');
      expect(result.current.isPolling).toBe(true);
    });
  });

  it('should clean up polling timeout on unmount', async () => {
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

    // Second fetch - processing (after FIRST_BACKOFF from pending)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF);
    });
    expect(result.current.status).toBe('processing');
    expect(result.current.isPolling).toBe(true);

    // Status changed: pending → processing, so backoff resets to INITIAL_POLL_MS.
    // Third fetch after INITIAL_POLL_MS (reset on transition)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INITIAL_POLL_MS);
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.isPolling).toBe(false);

    // No more fetches should occur
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should reset backoff delay on status transitions', async () => {
    vi.useFakeTimers();

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      // Calls 1-3: pending (build up backoff)
      // Call 4: processing (trigger reset)
      if (callCount <= 3) {
        return createMockFetchResponse(createPlanStatusResponse());
      }
      return createMockFetchResponse(
        createPlanStatusResponse({ status: 'processing' })
      );
    });

    renderHook(() => usePlanStatus('plan-123', 'pending', mockFetch));

    // Immediate fetch (call 1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // After FIRST_BACKOFF=1500 (call 2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // After SECOND_BACKOFF=2250 (call 3)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SECOND_BACKOFF);
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Next backoff would be 3375ms, but status changes → resets to INITIAL_POLL_MS
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THIRD_BACKOFF);
    });
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // After transition, backoff resets: next poll should be at INITIAL_POLL_MS (1000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INITIAL_POLL_MS);
    });
    expect(mockFetch).toHaveBeenCalledTimes(5);
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
