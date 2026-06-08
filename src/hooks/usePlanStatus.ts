'use client';

import type { PlanStatus } from '@/shared/types/client.types';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { computeNextDelay, INITIAL_POLL_MS } from '@/shared/constants/polling';
import { PlanStatusResponseSchema } from '@/shared/schemas/plan-status';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ZodError } from 'zod';

const MAX_CONSECUTIVE_FAILURES = 3;

function isRetriableFromResponse(status: number): boolean {
  return status === 429 || status >= 500;
}

class RetriableError extends Error {
  constructor(
    message: string,
    public readonly isRetriable: boolean,
  ) {
    super(message);
    this.name = 'RetriableError';
  }
}

interface UsePlanStatusReturn {
  status: PlanStatus;
  attempts: number;
  error: string | null;
  pollingError: string | null;
  isPolling: boolean;
  revalidate: () => Promise<void>;
}

type PlanPollState = {
  status: PlanStatus;
  attempts: number;
  error: string | null;
  pollingError: string | null;
};

type PlanPollAction =
  | { type: 'reset'; initialStatus: PlanStatus }
  | {
      type: 'apply_response';
      status: PlanStatus;
      attempts: number;
      error: string | null;
    }
  | { type: 'set_polling_error'; message: string }
  | { type: 'clear_polling_error' };

function planPollReducer(
  state: PlanPollState,
  action: PlanPollAction,
): PlanPollState {
  switch (action.type) {
    case 'reset':
      return {
        status: action.initialStatus,
        attempts: 0,
        error: null,
        pollingError: null,
      };
    case 'apply_response':
      return {
        ...state,
        status: action.status,
        attempts: action.attempts,
        error: action.error,
      };
    case 'set_polling_error':
      return { ...state, pollingError: action.message };
    case 'clear_polling_error':
      return { ...state, pollingError: null };
    default:
      return state;
  }
}

export function usePlanStatus(
  planId: string,
  initialStatus: PlanStatus,
  fetcher: typeof fetch = fetch,
): UsePlanStatusReturn {
  const [state, dispatch] = useReducer(planPollReducer, {
    status: initialStatus,
    attempts: 0,
    error: null,
    pollingError: null,
  });
  const [pollLoopRunning, setPollLoopRunning] = useState(false);
  const consecutiveFailuresRef = useRef(0);
  const previousStatusRef = useRef<PlanStatus>(initialStatus);
  const delayRef = useRef(INITIAL_POLL_MS);
  const previousPlanIdRef = useRef(planId);
  // Track latest initialStatus without making planId-reset effect depend on it.
  // This prevents a spurious full reset when initialStatus changes on the same plan.
  const initialStatusRef = useRef(initialStatus);
  useEffect(() => {
    initialStatusRef.current = initialStatus;
  });

  const shouldPoll =
    (state.status === 'pending' || state.status === 'processing') &&
    state.pollingError === null;
  const isPolling = shouldPoll && pollLoopRunning;

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetcher(`/api/v1/plans/${planId}/status`);

      if (!response.ok) {
        const parsed = await parseApiErrorResponse(
          response,
          `Failed to fetch plan status: ${response.status}`,
        );
        const retriable = isRetriableFromResponse(response.status);
        throw new RetriableError(parsed.error, retriable);
      }

      consecutiveFailuresRef.current = 0;

      const raw = (await response.json()) as unknown;
      const parseResult = PlanStatusResponseSchema.safeParse(raw);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const data = parseResult.data;

      previousStatusRef.current = data.status;
      dispatch({
        type: 'apply_response',
        status: data.status,
        attempts: data.attempts,
        error: data.latestError,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        clientLogger.error('Plan status response validation failed', {
          planId,
          error: err.flatten(),
        });
        consecutiveFailuresRef.current += 1;
        dispatch({
          type: 'set_polling_error',
          message: 'Received invalid plan status response from server.',
        });
        setPollLoopRunning(false);
        return;
      }

      const message =
        err instanceof Error ? err.message : 'Failed to fetch plan status';
      const isRetriable =
        err instanceof RetriableError ? err.isRetriable : true;

      if (!isRetriable) {
        clientLogger.error('Failed to poll plan status (non-retriable):', err);
        dispatch({ type: 'set_polling_error', message });
        setPollLoopRunning(false);
        return;
      }

      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        clientLogger.error(
          'Failed to poll plan status: max retries exhausted',
          err,
        );
        dispatch({ type: 'set_polling_error', message });
        setPollLoopRunning(false);
        return;
      }

      clientLogger.warn('Transient polling failure, will retry:', err);
    }
  }, [planId, fetcher]);

  const revalidate = useCallback(async (): Promise<void> => {
    consecutiveFailuresRef.current = 0;
    dispatch({ type: 'clear_polling_error' });
    setPollLoopRunning(true);
    await fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!shouldPoll) {
      setPollLoopRunning(false);
      return;
    }

    setPollLoopRunning(true);
    delayRef.current = INITIAL_POLL_MS;

    let cancelled = false;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const schedulePoll = () => {
      if (cancelled) return;
      pollTimeoutId = setTimeout(() => {
        if (cancelled) return;
        const prevStatus = previousStatusRef.current;
        void fetchStatus().then(() => {
          if (cancelled) return;
          // Reset backoff when a status transition occurs
          if (previousStatusRef.current !== prevStatus) {
            delayRef.current = INITIAL_POLL_MS;
          } else {
            delayRef.current = computeNextDelay(delayRef.current);
          }
          schedulePoll();
        });
      }, delayRef.current);
    };

    // Fire the first poll immediately, then start the backoff loop
    void (async () => {
      await fetchStatus();
      if (!cancelled) {
        delayRef.current = computeNextDelay(delayRef.current);
        schedulePoll();
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
      setPollLoopRunning(false);
    };
  }, [shouldPoll, fetchStatus]);

  // When the planId changes, reset all per-plan state so the new plan starts fresh
  // and stale state from the previous plan never leaks into the UI.
  useEffect(() => {
    if (previousPlanIdRef.current === planId) {
      return;
    }

    previousPlanIdRef.current = planId;
    previousStatusRef.current = initialStatusRef.current;
    delayRef.current = INITIAL_POLL_MS;
    consecutiveFailuresRef.current = 0;
    dispatch({ type: 'reset', initialStatus: initialStatusRef.current });
  }, [planId]);

  return {
    status: state.status,
    attempts: state.attempts,
    error: state.error,
    pollingError: state.pollingError,
    isPolling,
    revalidate,
  };
}
