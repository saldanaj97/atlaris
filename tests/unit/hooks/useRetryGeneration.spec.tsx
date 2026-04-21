import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsePlanGenerationSessionResult } from '@/features/plans/session/usePlanGenerationSession';
import { useRetryGeneration } from '@/hooks/useRetryGeneration';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh,
  }),
}));

function createMockSession(
  overrides: Partial<UsePlanGenerationSessionResult> = {}
): UsePlanGenerationSessionResult {
  return {
    state: {
      status: 'idle',
      modules: [],
      ...overrides.state,
    },
    startSession:
      overrides.startSession ??
      vi.fn().mockResolvedValue({
        status: 'completed' as const,
        planId: 'plan-x',
        result: 'plan-x',
      }),
    cancel: overrides.cancel ?? vi.fn(),
  };
}

describe('useRetryGeneration', () => {
  afterEach(() => {
    refresh.mockClear();
    vi.restoreAllMocks();
  });

  it('delegates retry to session.startSession with retry kind', async () => {
    const startSession = vi.fn().mockResolvedValue({
      status: 'completed' as const,
      planId: 'plan-1',
      result: 'plan-1',
    });
    const session = createMockSession({ startSession });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 0, session)
    );

    await act(async () => {
      await expect(result.current.retryGeneration()).resolves.toBeUndefined();
    });

    expect(startSession).toHaveBeenCalledWith({
      kind: 'retry',
      planId: 'plan-1',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('disables retry while session is generating', () => {
    const session = createMockSession({
      state: {
        status: 'generating',
        modules: [],
        planId: 'plan-1',
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 0, session)
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.status).toBe('retrying');
  });

  it('disables retry when attempts reach max', () => {
    const session = createMockSession();

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 3, session)
    );

    expect(result.current.isDisabled).toBe(true);
  });

  it('surfaces session error message', () => {
    const session = createMockSession({
      state: {
        status: 'error',
        modules: [],
        error: {
          message: 'provider down',
          classification: 'provider_error',
          retryable: true,
        },
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 1, session)
    );

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('provider down');
  });

  it('maps cancelled session to cancelled status and keeps retry enabled', () => {
    const session = createMockSession({
      state: {
        status: 'cancelled',
        modules: [],
        planId: 'plan-1',
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 1, session)
    );

    expect(result.current.status).toBe('cancelled');
    expect(result.current.isDisabled).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('disables retry when session is cancelled but max attempts reached', () => {
    const session = createMockSession({
      state: {
        status: 'cancelled',
        modules: [],
        planId: 'plan-1',
      },
    });

    const { result } = renderHook(() =>
      useRetryGeneration('plan-1', 3, 3, session)
    );

    expect(result.current.status).toBe('cancelled');
    expect(result.current.isDisabled).toBe(true);
  });
});
