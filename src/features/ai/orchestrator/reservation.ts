import type {
  GenerationAttemptContext,
  GenerationFailureResult,
} from '@/features/ai/types/orchestrator.types';
import type { AttemptRejection } from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import {
  createFailureResult,
  createSyntheticFailureAttempt,
} from '@/features/ai/orchestrator/attempt-failures';
import { AppError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';

const RESERVATION_REJECTION_DETAILS: Record<
  AttemptRejection['reason'],
  {
    classification: FailureClassification;
    message: (reservation: AttemptRejection) => string;
  }
> = {
  capped: {
    classification: 'capped',
    message: () => 'Generation attempt cap reached',
  },
  plan_limit: {
    classification: 'capped',
    message: () => 'Active plan limit reached for this subscription tier',
  },
  free_allowance_used: {
    classification: 'capped',
    message: () =>
      'Your free plan allowance has already been used. Upgrade to create another plan.',
  },
  free_initial_in_progress: {
    classification: 'conflict',
    message: () =>
      'A free plan is already being generated. Wait for it to finish or fail before starting another.',
  },
  rate_limited: {
    classification: 'rate_limit',
    message: () => 'Generation rate limit exceeded for this user',
  },
  in_progress: {
    classification: 'rate_limit',
    message: () =>
      'A generation is already in progress for this plan (concurrent conflict)',
  },
  active_child_generation: {
    classification: 'rate_limit',
    message: () =>
      'A module lesson generation is already in progress for this plan (concurrent conflict)',
  },
  invalid_status: {
    classification: 'validation',
    message: (reservation) =>
      `Generation attempt is not allowed for plan status: ${reservation.currentStatus ?? 'unknown'}`,
  },
};

function errorForReservationRejection(
  reservation: AttemptRejection,
  message: string,
): Error {
  switch (reservation.reason) {
    case 'free_allowance_used':
      return new AppError(message, {
        status: API_ERROR_HTTP_STATUS.FREE_PLAN_ALLOWANCE_USED,
        code: API_ERROR_CODES.FREE_PLAN_ALLOWANCE_USED,
        details: { upgradeUrl: '/pricing' },
      });
    case 'free_initial_in_progress':
      return new AppError(message, {
        status: API_ERROR_HTTP_STATUS.FREE_PLAN_GENERATION_IN_PROGRESS,
        code: API_ERROR_CODES.FREE_PLAN_GENERATION_IN_PROGRESS,
        classification: 'conflict',
      });
    case 'capped':
    case 'plan_limit':
    case 'rate_limited':
    case 'in_progress':
    case 'active_child_generation':
    case 'invalid_status':
      return new Error(message);
    default: {
      const _never: never = reservation.reason;
      return new Error(String(_never));
    }
  }
}

export function createReservationRejectionResult(
  context: GenerationAttemptContext,
  reservation: AttemptRejection,
  attemptClockStart: number,
  clock: () => number,
  nowFn: () => Date,
): GenerationFailureResult {
  const durationMs = Math.max(0, clock() - attemptClockStart);
  const rejectionDetails = RESERVATION_REJECTION_DETAILS[reservation.reason];
  const classification = rejectionDetails.classification;
  const errorMessage = rejectionDetails.message(reservation);

  const attempt = createSyntheticFailureAttempt({
    planId: context.planId,
    classification,
    durationMs,
    promptHash: null,
    generationPurpose: context.generationPurpose,
    now: nowFn,
  });

  logger.warn(
    {
      planId: context.planId,
      userId: context.userId,
      generationPurpose: context.generationPurpose,
      classification,
      errorMessage,
      reservationReason: reservation.reason,
      reservationCurrentStatus: reservation.currentStatus,
      attemptId: 'synthetic:no-db-row',
    },
    'Generation reservation rejected before attempt row creation',
  );

  return createFailureResult({
    classification,
    error: errorForReservationRejection(reservation, errorMessage),
    durationMs,
    extendedTimeout: false,
    timedOut: false,
    attempt,
    reservationRejectionReason: reservation.reason,
  });
}
