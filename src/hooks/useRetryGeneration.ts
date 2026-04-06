'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePlanGenerationSession } from '@/features/plans/session/usePlanGenerationSession';
import { clientLogger } from '@/lib/logging/client';

const RETRY_COOLDOWN_MS = 5000;

type RetryStatus = 'idle' | 'retrying' | 'success' | 'error';

interface UseRetryGenerationReturn {
  status: RetryStatus;
  error: string | null;
  isDisabled: boolean;
  retryGeneration: () => Promise<void>;
}

export function useRetryGeneration(
  planId: string,
  maxAttempts: number,
  currentAttempts: number
): UseRetryGenerationReturn {
  const router = useRouter();
  const { state, startSession, cancel } = usePlanGenerationSession();
  const [cooldownActive, setCooldownActive] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      cancel();
      retryInFlightRef.current = false;
    };
  }, [cancel]);

  const status: RetryStatus = (() => {
    switch (state.status) {
      case 'connecting':
      case 'generating':
        return 'retrying';
      case 'complete':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'idle';
    }
  })();

  const isDisabled =
    status === 'retrying' || currentAttempts >= maxAttempts || cooldownActive;

  const retryGeneration = useCallback(async () => {
    if (retryInFlightRef.current || cooldownActive) {
      return;
    }

    retryInFlightRef.current = true;
    setCooldownActive(true);

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }

    cooldownTimerRef.current = setTimeout(() => {
      setCooldownActive(false);
      cooldownTimerRef.current = null;
    }, RETRY_COOLDOWN_MS);

    try {
      const result = await startSession({ kind: 'retry', planId });
      if (result.status === 'completed') {
        router.refresh();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      clientLogger.error('Retry generation failed:', error);
    } finally {
      retryInFlightRef.current = false;
    }
  }, [cooldownActive, planId, router, startSession]);

  return {
    status,
    error: state.error?.message ?? null,
    isDisabled,
    retryGeneration,
  };
}
