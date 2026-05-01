import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { MutableRefObject } from 'react';
import { isStreamingError } from '@/hooks/useStreamingPlanGeneration';
import { isAbortError, normalizeThrown } from '@/lib/errors';

interface PlanGenerationLogger {
  error: (message: string, ...args: unknown[]) => void;
}

interface PlanGenerationToast {
  info: (message: string) => void;
  error: (message: string) => void;
}

interface HandleStreamingPlanErrorParams {
  streamError: unknown;
  cancellationToastShownRef: MutableRefObject<boolean>;
  planIdRef: MutableRefObject<string | undefined>;
  clientLogger: PlanGenerationLogger;
  toast: PlanGenerationToast;
  router: AppRouterInstance;
  redirectPath: string;
  logMessage: string;
  fallbackMessage: string;
  onAbort?: () => void;
}

interface HandleStreamingPlanErrorResult {
  handled: boolean;
  normalizedError: unknown;
  message: string;
}

export function handleStreamingPlanError({
  streamError,
  cancellationToastShownRef,
  planIdRef,
  clientLogger,
  toast,
  router,
  redirectPath,
  logMessage,
  fallbackMessage,
  onAbort,
}: HandleStreamingPlanErrorParams): HandleStreamingPlanErrorResult {
  const normalizedError = normalizeThrown(streamError);

  if (isAbortError(normalizedError)) {
    if (!cancellationToastShownRef.current) {
      toast.info('Generation cancelled');
      cancellationToastShownRef.current = true;
    }
    onAbort?.();
    return { handled: true, normalizedError, message: 'Generation cancelled' };
  }

  const isAuthRequired =
    isStreamingError(normalizedError) &&
    normalizedError.code === 'AUTH_REQUIRED';
  if (isAuthRequired) {
    toast.error('Please sign in to create a learning plan.');
    router.push(
      `/auth/sign-in?redirect_url=${encodeURIComponent(redirectPath)}`,
    );
    return { handled: true, normalizedError, message: 'Auth required' };
  }

  clientLogger.error(logMessage, streamError);

  const message =
    normalizedError instanceof Error
      ? normalizedError.message
      : fallbackMessage;

  const extractedPlanId = isStreamingError(normalizedError)
    ? (normalizedError.planId ??
      normalizedError.data?.planId ??
      planIdRef.current)
    : planIdRef.current;

  if (typeof extractedPlanId === 'string' && extractedPlanId.length > 0) {
    toast.error('Generation failed. You can retry from the plan page.');
    router.push(`/plans/${extractedPlanId}`);
    return { handled: true, normalizedError, message };
  }

  return { handled: false, normalizedError, message };
}
