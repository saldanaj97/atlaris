import type { UsePlanGenerationSessionResult } from '@/features/plans/session/usePlanGenerationSession';

import { useRetryGeneration } from '@/hooks/useRetryGeneration';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh,
  }),
}));

function createMockSession(
  overrides: Partial<UsePlanGenerationSessionResult> = {},
): UsePlanGenerationSessionResult {
  return {
    state: {
      status: 'idle',
      ...overrides.state,
    },
    startSession:
      overrides.startSession ??
      vi.fn().mockResolvedValue({
        status: 'started' as const,
        planId: 'plan-x',
        attemptId: 'attempt-x',
      }),
    cancel: overrides.cancel ?? vi.fn(),
  };
}

/** A startSession that accepts the retry the way the server's 202 does. */
function acceptingStartSession(planId: string) {
  return vi.fn<UsePlanGenerationSessionResult['startSession']>(
    async (_request, options) => {
      options?.onPlanIdReady?.(planId);
      return { status: 'started', planId, attemptId: 'attempt-2' };
    },
  );
}

describe('useRetryGeneration', () => {
  afterEach(() => {
    refresh.mockReset();
    vi.restoreAllMocks();
  });

  it('starts the retry, hands off to status polling, then refreshes', async () => {
    const order: string[] = [];
    const startSession = acceptingStartSession('plan-1');
    refresh.mockImplementation(() => order.push('refresh'));
    const onRetryStarted = vi.fn(() => order.push('poll'));
    const session = createMockSession({ startSession });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 0, session, onRetryStarted),
    );

    await act(async () => {
      await expect(result.current.retryGeneration()).resolves.toBeUndefined();
    });

    expect(startSession).toHaveBeenCalledWith(
      { kind: 'retry', planId: 'plan-1' },
      { onPlanIdReady: expect.any(Function) },
    );
    expect(onRetryStarted).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['poll', 'refresh']);
  });

  it('refreshes without resuming polling when the retry does not start', async () => {
    const startSession = vi.fn().mockRejectedValue(new Error('provider down'));
    const onRetryStarted = vi.fn();
    const session = createMockSession({ startSession });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 1, session, onRetryStarted),
    );

    await act(async () => {
      await expect(result.current.retryGeneration()).resolves.toBeUndefined();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onRetryStarted).not.toHaveBeenCalled();
  });

  it('does not refresh the router when retry is aborted', async () => {
    const startSession = vi
      .fn()
      .mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const session = createMockSession({ startSession });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 1, session),
    );

    await act(async () => {
      await expect(result.current.retryGeneration()).resolves.toBeUndefined();
    });

    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables retry while the retry request is starting', () => {
    const session = createMockSession({
      state: {
        status: 'starting',
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 0, session),
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.status).toBe('retrying');
  });

  it('returns to idle once the server accepts the retry (polling owns the status)', () => {
    const session = createMockSession({
      state: {
        status: 'started',
        planId: 'plan-1',
        attemptId: 'attempt-2',
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 2, session),
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('disables retry when attempts reach max', () => {
    const session = createMockSession();

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 3, session),
    );

    expect(result.current.isDisabled).toBe(true);
  });

  it('surfaces session error message', () => {
    const session = createMockSession({
      state: {
        status: 'error',
        error: {
          message: 'provider down',
          classification: 'provider_error',
          retryable: true,
        },
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 1, session),
    );

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('provider down');
  });

  it('maps cancelled session to cancelled status and keeps retry enabled', () => {
    const session = createMockSession({
      state: {
        status: 'cancelled',
        planId: 'plan-1',
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 1, session),
    );

    expect(result.current.status).toBe('cancelled');
    expect(result.current.isDisabled).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('disables retry when session is cancelled but max attempts reached', () => {
    const session = createMockSession({
      state: {
        status: 'cancelled',
        planId: 'plan-1',
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 3, session),
    );

    expect(result.current.status).toBe('cancelled');
    expect(result.current.isDisabled).toBe(true);
  });
});
