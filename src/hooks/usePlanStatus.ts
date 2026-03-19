'use client';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { computeNextDelay, INITIAL_POLL_MS } from '@/shared/constants/polling';
import { PLAN_STATUSES } from '@/shared/types/client';
import type { PlanStatus } from '@/shared/types/client.types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

const MAX_CONSECUTIVE_FAILURES = 3;

function isRetriableFromResponse(status: number): boolean {
  return status === 429 || status >= 500;
}

class RetriableError extends Error {
  constructor(
    message: string,
    public readonly isRetriable: boolean
  ) {
    super(message);
    this.name = 'RetriableError';
  }
}

interface StatusResponse {
  planId: string;
  status: PlanStatus;
  attempts: number;
  latestError: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const StatusResponseSchema: z.ZodType<StatusResponse> = z.object({
  planId: z.string(),
  status: z.enum(PLAN_STATUSES),
  attempts: z.number(),
  latestError: z.string().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

interface UsePlanStatusReturn {
  status: PlanStatus;
  attempts: number;
  error: string | null;
  pollingError: string | null;
  isPolling: boolean;
  revalidate: () => Promise<void>;
}

export function usePlanStatus(
  planId: string,
  initialStatus: PlanStatus,
  fetcher: typeof fetch = fetch
): UsePlanStatusReturn {
  const [status, setStatus] = useState<PlanStatus>(initialStatus);
  const [attempts, setAttempts] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const consecutiveFailuresRef = useRef(0);
  const previousStatusRef = useRef<PlanStatus>(initialStatus);
  const delayRef = useRef(INITIAL_POLL_MS);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPlanIdRef = useRef(planId);
  // Track latest initialStatus without making planId-reset effect depend on it.
  // This prevents a spurious full reset when initialStatus changes on the same plan.
  const initialStatusRef = useRef(initialStatus);
  useEffect(() => {
    initialStatusRef.current = initialStatus;
  });

  const shouldPoll =
    (status === 'pending' || status === 'processing') && pollingError === null;

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetcher(`/api/v1/plans/${planId}/status`);

      if (!response.ok) {
        const parsed = await parseApiErrorResponse(
          response,
          `Failed to fetch plan status: ${response.status}`
        );
        const retriable = isRetriableFromResponse(response.status);
        throw new RetriableError(parsed.error, retriable);
      }

      consecutiveFailuresRef.current = 0;

      const raw = (await response.json()) as unknown;
      const parseResult = StatusResponseSchema.safeParse(raw);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const data = parseResult.data;

      previousStatusRef.current = data.status;
      setStatus(data.status);
      setAttempts(data.attempts);

      setError(data.latestError);

      // Stop polling if terminal state reached
      if (data.status === 'ready' || data.status === 'failed') {
        setIsPolling(false);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        clientLogger.error('Plan status response validation failed', {
          planId,
          error: err.flatten(),
        });
        consecutiveFailuresRef.current += 1;
        setPollingError('Received invalid plan status response from server.');
        setIsPolling(false);
        return;
      }

      const message =
        err instanceof Error ? err.message : 'Failed to fetch plan status';
      const isRetriable =
        err instanceof RetriableError ? err.isRetriable : true;

      if (!isRetriable) {
        clientLogger.error('Failed to poll plan status (non-retriable):', err);
        setPollingError(message);
        setIsPolling(false);
        return;
      }

      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        clientLogger.error(
          'Failed to poll plan status: max retries exhausted',
          err
        );
        setPollingError(message);
        setIsPolling(false);
        return;
      }

      clientLogger.warn('Transient polling failure, will retry:', err);
    }
  }, [planId, fetcher]);

  const revalidate = useCallback(async (): Promise<void> => {
    consecutiveFailuresRef.current = 0;
    setPollingError(null);
    setIsPolling(true);
    await fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!shouldPoll) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    delayRef.current = INITIAL_POLL_MS;

    let cancelled = false;

    const schedulePoll = () => {
      if (cancelled) return;
      timeoutRef.current = setTimeout(() => {
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsPolling(false);
    };
  }, [shouldPoll, fetchStatus]);

  // When the planId changes, reset all per-plan state so the new plan starts fresh
  // and stale state from the previous plan never leaks into the UI.
  useEffect(() => {
    if (previousPlanIdRef.current === planId) {
      return;
    }

    previousPlanIdRef.current = planId;
    setStatus(initialStatusRef.current);
    setAttempts(0);
    setError(null);
    setPollingError(null);
    consecutiveFailuresRef.current = 0;
  }, [planId]);

  return { status, attempts, error, pollingError, isPolling, revalidate };
}
