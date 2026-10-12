import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { PlanGenerationWorkflowInput } from '@/features/plans/workflows/plan-generation.types';
import type { PlanGenerationRuntime } from '@/lib/config/env/jobs-worker';
import type {
  AttemptReservation,
  AttemptsDbClient,
  ReserveAttemptResult,
} from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import { dispatchPlanGenerationToWorker } from '@/features/jobs/plan-generation-dispatch';
import { toSerializableReservation } from '@/features/plans/workflows/plan-generation.types';
import { planGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { logger } from '@/lib/logging/logger';
import { start } from 'workflow/api';

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

/** The workflow input both runtimes receive for a reserved attempt. */
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
  readonly workflowStart?: typeof start;
  readonly workflowFn?: typeof planGenerationWorkflow;
  readonly dispatch?: typeof dispatchPlanGenerationToWorker;
  readonly clock?: () => number;
  readonly finalizeFailure?: FinalizeStartFailure;
};

export type StartPlanGenerationAttemptParams = {
  readonly lifecycleService: PlanLifecycleService;
  readonly dbClient: AttemptsDbClient;
  readonly correlationId: string;
  /** Read by the caller before anything is created or reserved. */
  readonly runtime: PlanGenerationRuntime;
  readonly input: ProcessGenerationInput;
};

/**
 * Reserves a create or retry attempt, then hands it to `PLAN_GENERATION_RUNTIME`
 * without waiting for generation: `vercel` starts `planGenerationWorkflow`;
 * `cloudflare` sends the signed `POST /v1/plan-generation/start`. The plan
 * page polls `GET /api/v1/plans/:planId/status` for the outcome.
 */
export async function startPlanGenerationAttempt(
  params: StartPlanGenerationAttemptParams,
  deps: StartPlanGenerationAttemptDeps = {},
): Promise<StartPlanGenerationAttemptResult> {
  const { lifecycleService, dbClient, correlationId, runtime, input } = params;
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
    runtime,
  };

  let startError: Error;
  if (runtime === 'cloudflare') {
    const dispatch = deps.dispatch ?? dispatchPlanGenerationToWorker;
    const dispatched = await dispatch(workflowInput);
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
  } else {
    const workflowStart = deps.workflowStart ?? start;
    const workflowFn = deps.workflowFn ?? planGenerationWorkflow;
    try {
      const run = await workflowStart(workflowFn, [workflowInput]);
      logger.info(
        { ...context, workflowRunId: run.runId },
        'Plan generation workflow started',
      );
      return { kind: 'started', attemptId: reservation.attemptId };
    } catch (error) {
      startError =
        error instanceof Error
          ? error
          : new Error('Failed to start plan generation workflow');
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
