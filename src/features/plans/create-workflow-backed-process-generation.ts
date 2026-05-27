import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';

import { GenerationFinalizationAdapter } from '@/features/plans/lifecycle/generation-finalization/adapter';
import { toSerializableReservation } from '@/features/plans/workflows/plan-generation.types';
import { planGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { start } from 'workflow/api';

export type CreateWorkflowBackedProcessGenerationDeps = {
  readonly reserveAttemptSlot?: typeof reserveAttemptSlot;
  readonly workflowStart?: typeof start;
  readonly workflowFn?: typeof planGenerationWorkflow;
  readonly finalizeFailure?: (
    dbClient: AttemptsDbClient,
    input: {
      reservation: AttemptReservation;
      planId: string;
      userId: string;
      error: Error;
    },
  ) => Promise<void>;
};

async function defaultFinalizeWorkflowStartFailure(
  dbClient: AttemptsDbClient,
  input: {
    reservation: AttemptReservation;
    planId: string;
    userId: string;
    error: Error;
  },
): Promise<void> {
  const finalization = new GenerationFinalizationAdapter(dbClient);
  await finalization.finalizeFailure({
    variant: 'reserved_attempt',
    planId: input.planId,
    userId: input.userId,
    attemptId: input.reservation.attemptId,
    preparation: input.reservation,
    classification: 'provider_error',
    error: input.error,
    durationMs: 0,
    timedOut: false,
    extendedTimeout: false,
    usageKind: 'plan',
    retryable: true,
  });
}

/**
 * Reserves the attempt in-process (emitting `plan_start`), then runs durable
 * provider/finalization work inside a Workflow SDK workflow.
 */
export function createWorkflowBackedProcessGeneration(
  lifecycleService: PlanLifecycleService,
  dbClient: AttemptsDbClient,
  correlationId: string,
  deps: CreateWorkflowBackedProcessGenerationDeps = {},
): (input: ProcessGenerationInput) => Promise<GenerationAttemptResult> {
  const reserveSlot = deps.reserveAttemptSlot ?? reserveAttemptSlot;
  const workflowStart = deps.workflowStart ?? start;
  const workflowFn = deps.workflowFn ?? planGenerationWorkflow;
  const finalizeFailure =
    deps.finalizeFailure ?? defaultFinalizeWorkflowStartFailure;

  return async (input) => {
    const reservation = await reserveSlot({
      planId: input.planId,
      userId: input.userId,
      input: input.input,
      dbClient,
      ...(input.allowedGenerationStatuses !== undefined
        ? { allowedGenerationStatuses: input.allowedGenerationStatuses }
        : {}),
      ...(input.requiredGenerationStatus !== undefined
        ? { requiredGenerationStatus: input.requiredGenerationStatus }
        : {}),
    });

    if (!reservation.reserved) {
      return lifecycleService.processGenerationAttempt(input);
    }

    input.onAttemptReserved?.(reservation);

    try {
      const run = await workflowStart(workflowFn, [
        {
          planId: input.planId,
          userId: input.userId,
          tier: input.tier,
          input: input.input,
          modelOverride: input.modelOverride ?? null,
          correlationId,
          reservation: toSerializableReservation(reservation),
          allowedGenerationStatuses: input.allowedGenerationStatuses,
          requiredGenerationStatus: input.requiredGenerationStatus,
        },
      ]);

      return await run.returnValue;
    } catch (error: unknown) {
      const workflowError =
        error instanceof Error
          ? error
          : new Error('Failed to start plan generation workflow');

      await finalizeFailure(dbClient, {
        reservation,
        planId: input.planId,
        userId: input.userId,
        error: workflowError,
      });

      throw workflowError;
    }
  };
}
