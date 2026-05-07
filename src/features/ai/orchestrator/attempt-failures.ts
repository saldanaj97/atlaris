import { classifyFailure } from '@/features/ai/classification';
import {
  cleanupTimeoutLifecycle,
  type TimeoutLifecycle,
} from '@/features/ai/orchestrator/timeout-lifecycle';
import { ProviderTimeoutError } from '@/features/ai/providers/errors';
import { logger } from '@/lib/logging/logger';

import type {
  AttemptOperations,
  GenerationAttemptContext,
  GenerationAttemptRecordForResponse,
  GenerationExecutionFailureReserved,
  GenerationFailureResult,
} from '@/features/ai/types/orchestrator.types';
import type { ProviderMetadata } from '@/features/ai/types/provider.types';
import type {
  AttemptRejection,
  AttemptReservation,
  AttemptsDbClient,
  FinalizeFailureParams,
} from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

const SYNTHETIC_FAILURE_ATTEMPT_DEFAULTS = {
  id: null,
  status: 'failure',
  modulesCount: 0,
  tasksCount: 0,
  truncatedTopic: false,
  truncatedNotes: false,
  normalizedEffort: false,
  metadata: null,
} as const;

function toGenerationError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return new Error(error);
  }

  let detail: string;
  if (error && typeof error === 'object') {
    try {
      detail = JSON.stringify(error);
    } catch {
      detail = Object.prototype.toString.call(error);
    }
  } else if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint' ||
    typeof error === 'symbol'
  ) {
    detail = String(error);
  } else {
    detail = 'no additional detail';
  }

  return new Error(`Unknown generation error: ${detail}`);
}

export function createSyntheticFailureAttempt(params: {
  planId: string;
  classification: FailureClassification;
  durationMs: number;
  promptHash: string | null;
  now: () => Date;
}): GenerationAttemptRecordForResponse {
  const { planId, classification, durationMs, promptHash, now } = params;

  return {
    ...SYNTHETIC_FAILURE_ATTEMPT_DEFAULTS,
    planId,
    classification,
    durationMs,
    promptHash,
    createdAt: now(),
  };
}

async function safelyFinalizeFailure(
  attemptOps: AttemptOperations,
  finalizeParams: FinalizeFailureParams,
  fallbackPromptHash: string,
): Promise<GenerationAttemptRecordForResponse> {
  try {
    return await attemptOps.finalizeAttemptFailure(finalizeParams);
  } catch (finalizeError) {
    logger.error(
      {
        planId: finalizeParams.planId,
        attemptId: finalizeParams.attemptId,
        finalizeError,
        originalError: finalizeParams.error,
      },
      'Failed to finalize generation attempt failure',
    );

    return createSyntheticFailureAttempt({
      planId: finalizeParams.planId,
      classification: finalizeParams.classification,
      durationMs: finalizeParams.durationMs,
      promptHash: fallbackPromptHash,
      now: finalizeParams.now ?? (() => new Date()),
    });
  }
}

export function createFailureResult(params: {
  classification: FailureClassification;
  error: Error;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: boolean;
  attempt: GenerationAttemptRecordForResponse;
  metadata?: ProviderMetadata;
  rawText?: string;
  reservationRejectionReason?: AttemptRejection['reason'];
}): GenerationFailureResult {
  const { metadata, rawText, reservationRejectionReason, ...rest } = params;

  return {
    ...rest,
    status: 'failure',
    ...(metadata !== undefined && { metadata }),
    ...(rawText !== undefined && { rawText }),
    ...(reservationRejectionReason !== undefined && {
      reservationRejectionReason,
    }),
  };
}

export function buildUnfinalizedReservedFailure(params: {
  error: unknown;
  reservation: AttemptReservation;
  attemptClockStart: number;
  clock: () => number;
  timeoutLifecycle?: TimeoutLifecycle;
  providerMetadata?: ProviderMetadata;
  rawText?: string;
}): GenerationExecutionFailureReserved {
  const {
    error,
    reservation,
    attemptClockStart,
    clock,
    timeoutLifecycle,
    providerMetadata,
    rawText,
  } = params;

  if (timeoutLifecycle) {
    cleanupTimeoutLifecycle(timeoutLifecycle);
  }

  const durationMs = Math.max(0, clock() - attemptClockStart);
  const normalizedError = toGenerationError(error);
  const timedOut =
    (timeoutLifecycle?.timeout.timedOut ?? false) ||
    normalizedError instanceof ProviderTimeoutError;
  const extendedTimeout = timeoutLifecycle?.timeout.didExtend ?? false;
  const classification = classifyFailure({
    error: normalizedError,
    timedOut,
  });

  return {
    kind: 'failure_reserved',
    reservation,
    classification,
    error: normalizedError,
    durationMs,
    extendedTimeout,
    timedOut,
    ...(providerMetadata !== undefined && { metadata: providerMetadata }),
    ...(rawText !== undefined && { rawText }),
  };
}

export async function finalizeReservedExecutionFailure(params: {
  unfinalized: GenerationExecutionFailureReserved;
  attemptOps: AttemptOperations;
  context: GenerationAttemptContext;
  dbClient: AttemptsDbClient;
  nowFn: () => Date;
}): Promise<GenerationFailureResult> {
  const { unfinalized, attemptOps, context, dbClient, nowFn } = params;

  const attempt = await safelyFinalizeFailure(
    attemptOps,
    {
      attemptId: unfinalized.reservation.attemptId,
      planId: context.planId,
      preparation: unfinalized.reservation,
      classification: unfinalized.classification,
      durationMs: unfinalized.durationMs,
      timedOut: unfinalized.timedOut,
      extendedTimeout: unfinalized.extendedTimeout,
      providerMetadata: unfinalized.metadata,
      error: unfinalized.error,
      dbClient,
      now: nowFn,
    },
    unfinalized.reservation.promptHash,
  );

  return createFailureResult({
    classification: unfinalized.classification,
    error: unfinalized.error,
    durationMs: unfinalized.durationMs,
    extendedTimeout: unfinalized.extendedTimeout,
    timedOut: unfinalized.timedOut,
    attempt,
    metadata: unfinalized.metadata,
    rawText: unfinalized.rawText,
  });
}
