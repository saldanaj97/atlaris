import type {
  GenerationAttemptRecordForResponse,
  GenerationExecutionFailureReserved,
  GenerationFailureResult,
} from '@/features/ai/types/orchestrator.types';
import type { ProviderMetadata } from '@/features/ai/types/provider.types';
import type {
  AttemptRejection,
  AttemptReservation,
} from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';

import { classifyFailure } from '@/features/ai/classification';
import {
  cleanupTimeoutLifecycle,
  type TimeoutLifecycle,
} from '@/features/ai/orchestrator/timeout-lifecycle';
import { ProviderTimeoutError } from '@/features/ai/providers/errors';

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
  generationPurpose: GenerationPurpose;
  now: () => Date;
}): GenerationAttemptRecordForResponse {
  const {
    planId,
    classification,
    durationMs,
    promptHash,
    generationPurpose,
    now,
  } = params;

  return {
    ...SYNTHETIC_FAILURE_ATTEMPT_DEFAULTS,
    planId,
    generationPurpose,
    classification,
    durationMs,
    promptHash,
    createdAt: now(),
  };
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
