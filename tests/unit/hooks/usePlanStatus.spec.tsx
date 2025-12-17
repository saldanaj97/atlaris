import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlanStatus } from '@/hooks/usePlanStatus';

describe('usePlanStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should initialize with provided initial status', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          planId: 'plan-123',
          status: 'pending',
          attempts: 1,
          latestJobId: 'job-123',
          latestJobStatus: 'processing',
          latestError: null,
        }),
      })
    );

    const { result } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    expect(result.current.status).toBe('pending');
    expect(result.current.attempts).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.isPolling).toBe(true);
  });

  it('should fetch plan status on mount when status is pending', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        planId: 'plan-123',
        status: 'processing',
        attempts: 1,
        latestJobId: 'job-123',
        latestJobStatus: 'processing',
        latestError: null,
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    renderHook(() => usePlanStatus('plan-123', 'pending'));

    // Wait for the immediate fetch call
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/plans/plan-123/status');
    });
  });

  it('should update status and attempts from API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          planId: 'plan-123',
          status: 'processing',
          attempts: 2,
          latestJobId: 'job-123',
          latestJobStatus: 'processing',
          latestError: null,
        }),
      })
    );

    const { result } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    await vi.waitFor(() => {
      expect(result.current.status).toBe('processing');
      expect(result.current.attempts).toBe(2);
      expect(result.current.isPolling).toBe(true);
    });
  });

  it('should stop polling when status becomes ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          planId: 'plan-123',
          status: 'ready',
          attempts: 3,
          latestJobId: 'job-123',
          latestJobStatus: 'completed',
          latestError: null,
        }),
      })
    );

    const { result } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    await vi.waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.isPolling).toBe(false);
    });
  });

  it('should stop polling when status becomes failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          planId: 'plan-123',
          status: 'failed',
          attempts: 3,
          latestJobId: 'job-123',
          latestJobStatus: 'failed',
          latestError: 'AI provider error',
        }),
      })
    );

    const { result } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    await vi.waitFor(() => {
      expect(result.current.status).toBe('failed');
      expect(result.current.error).toBe('AI provider error');
      expect(result.current.isPolling).toBe(false);
    });
  });

  it('should set error when latestError is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          planId: 'plan-123',
          status: 'failed',
          attempts: 1,
          latestJobId: 'job-123',
          latestJobStatus: 'failed',
          latestError: 'Validation error: topic too short',
        }),
      })
    );

    const { result } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    await vi.waitFor(() => {
      expect(result.current.error).toBe('Validation error: topic too short');
    });
  });

  it('should poll every 3 seconds when status is pending', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        planId: 'plan-123',
        status: 'pending',
        attempts: 1,
        latestJobId: 'job-123',
        latestJobStatus: 'pending',
        latestError: null,
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    renderHook(() => usePlanStatus('plan-123', 'pending'));

    // Wait for the immediate fetch to complete
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // First poll after 3 seconds
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second poll after another 3 seconds
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should poll every 3 seconds when status is processing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        planId: 'plan-123',
        status: 'processing',
        attempts: 1,
        latestJobId: 'job-123',
        latestJobStatus: 'processing',
        latestError: null,
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    renderHook(() => usePlanStatus('plan-123', 'processing'));

    // Wait for the immediate fetch to complete
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // First poll after 3 seconds
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not poll when initial status is ready', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => usePlanStatus('plan-123', 'ready'));

    expect(result.current.status).toBe('ready');
    expect(result.current.isPolling).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should not poll when initial status is failed', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => usePlanStatus('plan-123', 'failed'));

    expect(result.current.status).toBe('failed');
    expect(result.current.isPolling).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle fetch errors gracefully without stopping polling', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          planId: 'plan-123',
          status: 'processing',
          attempts: 1,
          latestJobId: 'job-123',
          latestJobStatus: 'processing',
          latestError: null,
        }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    // Wait for the immediate fetch to complete (fails)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Should continue polling despite error
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Status should be updated from successful second fetch
    await vi.waitFor(() => {
      expect(result.current.status).toBe('processing');
      expect(result.current.isPolling).toBe(true);
    });
  });

  it('should handle network errors without stopping polling', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          planId: 'plan-123',
          status: 'processing',
          attempts: 1,
          latestJobId: 'job-123',
          latestJobStatus: 'processing',
          latestError: null,
        }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    // Wait for the immediate fetch to complete (throws error)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Should continue polling despite error
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Status should be updated from successful second fetch
    await vi.waitFor(() => {
      expect(result.current.status).toBe('processing');
      expect(result.current.isPolling).toBe(true);
    });
  });

  it('should clean up polling interval on unmount', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        planId: 'plan-123',
        status: 'pending',
        attempts: 1,
        latestJobId: 'job-123',
        latestJobStatus: 'pending',
        latestError: null,
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { unmount } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    // Wait for the immediate fetch to complete
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Unmount the hook
    unmount();

    // Advance time - no more fetches should occur
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should transition from pending to processing to ready', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            planId: 'plan-123',
            status: 'pending',
            attempts: 1,
            latestJobId: 'job-123',
            latestJobStatus: 'pending',
            latestError: null,
          }),
        };
      } else if (callCount === 2) {
        return {
          ok: true,
          json: async () => ({
            planId: 'plan-123',
            status: 'processing',
            attempts: 1,
            latestJobId: 'job-123',
            latestJobStatus: 'processing',
            latestError: null,
          }),
        };
      } else {
        return {
          ok: true,
          json: async () => ({
            planId: 'plan-123',
            status: 'ready',
            attempts: 1,
            latestJobId: 'job-123',
            latestJobStatus: 'completed',
            latestError: null,
          }),
        };
      }
    });

    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => usePlanStatus('plan-123', 'pending'));

    // Initial fetch - pending
    await vi.waitFor(() => {
      expect(result.current.status).toBe('pending');
      expect(result.current.isPolling).toBe(true);
    });

    // Second fetch - processing
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => {
      expect(result.current.status).toBe('processing');
      expect(result.current.isPolling).toBe(true);
    });

    // Third fetch - ready (should stop polling)
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.isPolling).toBe(false);
    });

    // No more fetches should occur
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
