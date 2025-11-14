'use client';

import { clientLogger } from '@/lib/logging/client';
import type { PlanStatus } from '@/lib/types/client';
import { useCallback, useEffect, useState } from 'react';

interface StatusResponse {
  planId: string;
  status: PlanStatus;
  attempts: number;
  latestJobId: string | null;
  latestJobStatus: string | null;
  latestJobError: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface UsePlanStatusReturn {
  status: PlanStatus;
  attempts: number;
  error: string | null;
  isPolling: boolean;
}

export function usePlanStatus(
  planId: string,
  initialStatus: PlanStatus
): UsePlanStatusReturn {
  const [status, setStatus] = useState<PlanStatus>(initialStatus);
  const [attempts, setAttempts] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const shouldPoll = status === 'pending' || status === 'processing';

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/plans/${planId}/status`);

      if (!response.ok) {
        throw new Error(`Failed to fetch plan status: ${response.status}`);
      }

      const data = (await response.json()) as StatusResponse;

      setStatus(data.status);
      setAttempts(data.attempts);

      if (data.latestJobError) {
        setError(data.latestJobError);
      }

      // Stop polling if terminal state reached
      if (data.status === 'ready' || data.status === 'failed') {
        setIsPolling(false);
      }
    } catch (err) {
      clientLogger.error('Failed to poll plan status:', err);
      // Don't stop polling on network errors, just log
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

  return { status, attempts, error, isPolling };
}
