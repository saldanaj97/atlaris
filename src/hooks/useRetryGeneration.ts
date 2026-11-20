'use client';

import type { UsePlanGenerationSessionResult } from '@/features/plans/session/usePlanGenerationSession';

import { clientLogger } from '@/lib/logging/client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const RETRY_COOLDOWN_MS = 5000;

type RetryStatus = 'idle' | 'retrying' | 'error' | 'cancelled';

interface UseRetryGenerationReturn {
  status: RetryStatus;
  error: string | null;
  isDisabled: boolean;
  retryGeneration: () => Promise<void>;
}

export function useRetryGeneration(
  planId: string,
  maxAttempts: number,
  currentAttempts: number,
  session: UsePlanGenerationSessionResult,
  onRetryStarted?: () => void,
): UseRetryGenerationReturn {
  const router = useRouter();
  const { state, startSession, cancel } = session;
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
      case 'starting':
        return 'retrying';
      case 'error':
        return 'error';
      case 'cancelled':
        return 'cancelled';
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
      // Refresh on any settle so failed-plan SSR `plan.attempts` rehydrates
      // (terminal usePlanStatus keeps poller attempts at 0).
      await startSession(
        { kind: 'retry', planId },
        { onPlanIdReady: () => onRetryStarted?.() },
      );
      router.refresh();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        clientLogger.error('Retry generation failed:', error);
        router.refresh();
      }
    }

    retryInFlightRef.current = false;
  }, [cooldownActive, onRetryStarted, planId, router, startSession]);

  return {
    status,
    error: state.error?.message ?? null,
    isDisabled,
    retryGeneration,
  };
}
