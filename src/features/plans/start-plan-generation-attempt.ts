import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { PlanGenerationWorkflowInput } from '@/features/plans/workflows/plan-generation.types';
import type {
  AttemptReservation,
  AttemptsDbClient,
  ReserveAttemptResult,
} from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import { dispatchPlanGenerationToWorker } from '@/features/jobs/plan-generation-dispatch';
import { toSerializableReservation } from '@/features/plans/workflows/plan-generation.types';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { logger } from '@/lib/logging/logger';

const DEFAULT_CLOCK = () => Date.now();

/** Settles a reserved attempt whose generation never started. */
export type FinalizeStartFailure = (
  dbClient: AttemptsDbClient,
  input: {
    reservation: AttemptReservation;
    planId: string;
    userId: string;
    error: Error;
  },
) => Promise<void>;

/**
 * The start-failure settlement shared by every plan-generation start: the
 * reserved attempt fails as a retryable `provider_error` before provider work.
 */
export function settleStartFailureWith(
  lifecycleService: PlanLifecycleService,
): FinalizeStartFailure {
  return async (_dbClient, failureInput) => {
    await lifecycleService.settleReservedAttemptFailure({
      reservation: failureInput.reservation,
      planId: failureInput.planId,
      userId: failureInput.userId,
      error: failureInput.error,
      classification: 'provider_error',
      generationPurpose: failureInput.reservation.generationPurpose,
      retryable: true,
      durationMs: 0,
      timedOut: false,
      extendedTimeout: false,
    });
  };
}

export function reservePlanGenerationAttempt(
  reserveSlot: typeof reserveAttemptSlot,
  input: ProcessGenerationInput,
  dbClient: AttemptsDbClient,
): Promise<ReserveAttemptResult> {
  return reserveSlot({
    planId: input.planId,
    userId: input.userId,
    input: input.input,
    generationPurpose: input.generationPurpose,
    dbClient,
    ...(input.allowedGenerationStatuses !== undefined
      ? { allowedGenerationStatuses: input.allowedGenerationStatuses }
      : {}),
    ...(input.requiredGenerationStatus !== undefined
      ? { requiredGenerationStatus: input.requiredGenerationStatus }
      : {}),
  });
}

/** The workflow input the Worker receives for a reserved attempt. */
export function buildPlanGenerationWorkflowInput(
  input: ProcessGenerationInput,
  reservation: AttemptReservation,
  correlationId: string,
): PlanGenerationWorkflowInput {
  return {
    planId: input.planId,
    userId: input.userId,
    tier: input.tier,
    input: input.input,
    generationPurpose: input.generationPurpose,
    modelOverride: input.modelOverride ?? null,
    // Omitted without a pick, so starts stay valid on a Worker deployed before JCS-169.
    ...(input.groundedWriterModelId
      ? { groundedWriterModelId: input.groundedWriterModelId }
      : {}),
    correlationId,
    reservation: toSerializableReservation(reservation),
    allowedGenerationStatuses: input.allowedGenerationStatuses,
    requiredGenerationStatus: input.requiredGenerationStatus,
  };
}

export type StartPlanGenerationAttemptResult =
  /** The attempt is reserved and its runtime accepted it; poll for the outcome. */
  | { readonly kind: 'started'; readonly attemptId: string }
  /**
   * Nothing is running: either the reservation was rejected, or the runtime
   * did not start the reserved attempt. Both are settled before returning.
   */
  | {
      readonly kind: 'not_started';
      readonly classification: FailureClassification | 'unknown';
    };

export type StartPlanGenerationAttemptDeps = {
  readonly reserveAttemptSlot?: typeof reserveAttemptSlot;
  readonly dispatch?: typeof dispatchPlanGenerationToWorker;
  readonly clock?: () => number;
  readonly finalizeFailure?: FinalizeStartFailure;
};

export type StartPlanGenerationAttemptParams = {
  readonly lifecycleService: PlanLifecycleService;
  readonly dbClient: AttemptsDbClient;
  readonly correlationId: string;
  readonly input: ProcessGenerationInput;
};

/**
 * Reserves a create or retry attempt, then hands it to the jobs Worker with
 * the signed `POST /v1/plan-generation/start` without waiting for generation.
 * The plan page polls `GET /api/v1/plans/:planId/status` for the outcome.
 */
export async function startPlanGenerationAttempt(
  params: StartPlanGenerationAttemptParams,
  deps: StartPlanGenerationAttemptDeps = {},
): Promise<StartPlanGenerationAttemptResult> {
  const { lifecycleService, dbClient, correlationId, input } = params;
  const reserveSlot = deps.reserveAttemptSlot ?? reserveAttemptSlot;
  const clock = deps.clock ?? DEFAULT_CLOCK;
  const finalizeFailure =
    deps.finalizeFailure ?? settleStartFailureWith(lifecycleService);

  const startedAt = clock();
  const reservation = await reservePlanGenerationAttempt(
    reserveSlot,
    input,
    dbClient,
  );

  if (!reservation.reserved) {
    const settled = await lifecycleService.settleReservationRejection(
      input,
      reservation,
      { startedAt, clock },
    );
    return {
      kind: 'not_started',
      classification:
        'classification' in settled ? settled.classification : 'unknown',
    };
  }

  const workflowInput = buildPlanGenerationWorkflowInput(
    input,
    reservation,
    correlationId,
  );
  const context = {
    planId: input.planId,
    userId: input.userId,
    attemptId: reservation.attemptId,
    correlationId,
  };

  const dispatch = deps.dispatch ?? dispatchPlanGenerationToWorker;
  const dispatched = await dispatch(workflowInput);
  let startError: Error;
  switch (dispatched.kind) {
    case 'accepted':
    case 'duplicate':
      return { kind: 'started', attemptId: reservation.attemptId };
    case 'disabled':
      startError = new Error(
        `Jobs Worker refused plan generation (${dispatched.code})`,
      );
      break;
    case 'failed':
      startError = new Error('Jobs Worker did not start plan generation');
      break;
    default: {
      const _exhaustive: never = dispatched;
      return _exhaustive;
    }
  }

  logger.error(
    { ...context, err: startError },
    'Plan generation did not start; settling the reserved attempt',
  );
  await finalizeFailure(dbClient, {
    reservation,
    planId: input.planId,
    userId: input.userId,
    error: startError,
  });
  return { kind: 'not_started', classification: 'provider_error' };
}
