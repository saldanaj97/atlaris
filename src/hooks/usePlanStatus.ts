'use client';

import {
  parseApiErrorResponse,
  type ApiErrorResponse,
} from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import type { PlanStatus } from '@/lib/types/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

const MAX_CONSECUTIVE_FAILURES = 3;

function isRetriableFromResponse(
  status: number,
  _parsed: ApiErrorResponse
): boolean {
  if (status >= 500) return true;
  if (status >= 400 && status < 500) return false;
  return true;
}

const StatusResponseSchema = z
  .object({
    planId: z.string(),
    status: z.enum(['pending', 'processing', 'ready', 'failed']),
    attempts: z.number(),
    latestError: z.string().nullable(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();

type StatusResponse = z.infer<typeof StatusResponseSchema>;

interface UsePlanStatusReturn {
  status: PlanStatus;
  attempts: number;
  error: string | null;
  pollingError: string | null;
  isPolling: boolean;
}

export function usePlanStatus(
  planId: string,
  initialStatus: PlanStatus
): UsePlanStatusReturn {
  const [status, setStatus] = useState<PlanStatus>(initialStatus);
  const [attempts, setAttempts] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const consecutiveFailuresRef = useRef(0);

  const shouldPoll =
    (status === 'pending' || status === 'processing') && pollingError === null;

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/plans/${planId}/status`);

      if (!response.ok) {
        const parsed = await parseApiErrorResponse(
          response,
          `Failed to fetch plan status: ${response.status}`
        );
        const retriable = isRetriableFromResponse(response.status, parsed);
        const e = new Error(parsed.error) as Error & { isRetriable?: boolean };
        e.isRetriable = retriable;
        throw e;
      }

      consecutiveFailuresRef.current = 0;

      const raw = (await response.json()) as unknown;
      const parseResult = StatusResponseSchema.safeParse(raw);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const data: StatusResponse = parseResult.data;

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
        setError('Received invalid plan status response from server.');
        setIsPolling(false);
        return;
      }

      clientLogger.error('Failed to poll plan status:', err);

      const message =
        err instanceof Error ? err.message : 'Failed to fetch plan status';
      const isRetriable =
        (err as Error & { isRetriable?: boolean }).isRetriable !== false;

      if (!isRetriable) {
        setPollingError(message);
        setIsPolling(false);
        return;
      }

      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setPollingError(message);
        setIsPolling(false);
      }
    }
  }, [planId]);

  useEffect(() => {
    if (!shouldPoll) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    // Poll immediately on mount
    void fetchStatus();

    // Then poll every 3 seconds
    const pollInterval = setInterval(() => {
      void fetchStatus();
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      setIsPolling(false);
    };
  }, [shouldPoll, fetchStatus]);

  useEffect(() => {
    consecutiveFailuresRef.current = 0;
    setPollingError(null);
  }, [planId]);

  return { status, attempts, error, pollingError, isPolling };
}
