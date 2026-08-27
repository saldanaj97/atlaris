import type {
  GenerationRunParams,
  GenerationRunResult,
  PlanLifecycleGeneration,
} from './service';
import type { GeneratedModule } from './types';
import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { GenerationInput } from '@/features/ai/types/provider.types';
import type { DbClient } from '@/lib/db/types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';

import { resolveModelForTier } from '@/features/ai/model-resolver';
import { runGenerationExecution } from '@/features/ai/orchestrator';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { isKnownFailureClassification } from '@/shared/types/failure-classification';
import { parseGenerationPurpose } from '@/shared/types/generation-purpose';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { and, eq } from 'drizzle-orm';

function modelOperationForGenerationPurpose(
  purpose: GenerationPurpose,
): ModelOperation {
  switch (purpose) {
    case 'initial':
      return 'initial_outline';
    case 'regeneration':
      return 'regeneration';
    default: {
      const _never: never = purpose;
      throw new Error(`Unhandled generation purpose: ${String(_never)}`);
    }
  }
}

async function validateReservation(
  dbClient: DbClient,
  params: GenerationRunParams,
): Promise<
  Extract<GenerationRunResult, { status: 'already_finalized' }> | undefined
> {
  if (!params.reservation) {
    return undefined;
  }

  const [row] = await dbClient
    .select({
      attemptId: generationAttempts.id,
      attemptStatus: generationAttempts.status,
      generationPurpose: generationAttempts.generationPurpose,
      classification: generationAttempts.classification,
      planStatus: learningPlans.generationStatus,
    })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(
      and(
        eq(generationAttempts.id, params.reservation.attemptId),
        eq(generationAttempts.planId, params.planId),
        eq(learningPlans.userId, params.userId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(
      `Stale generation reservation ${params.reservation.attemptId} for plan ${params.planId}: attempt was not found for the requested plan/user.`,
    );
  }

  if (row.generationPurpose !== params.generationPurpose) {
    throw new Error(
      `Stale generation reservation ${params.reservation.attemptId} for plan ${params.planId}: purpose ${row.generationPurpose} does not match ${params.generationPurpose}.`,
    );
  }

  if (row.attemptStatus === 'success') {
    return {
      status: 'already_finalized',
      planId: params.planId,
      outcome: 'success',
    };
  }

  if (row.attemptStatus === 'failure') {
    const classification =
      row.classification && isKnownFailureClassification(row.classification)
        ? row.classification
        : 'unknown';
    return {
      status: 'already_finalized',
      planId: params.planId,
      outcome: 'failure',
      classification,
      error: new Error(
        `Generation attempt ${params.reservation.attemptId} was already finalized as a ${classification} failure.`,
      ),
    };
  }

  if (row.attemptStatus !== 'in_progress') {
    throw new Error(
      `Stale generation reservation ${params.reservation.attemptId} for plan ${params.planId}: attempt status is ${row.attemptStatus}.`,
    );
  }

  if (row.planStatus !== 'generating') {
    throw new Error(
      `Stale generation reservation ${params.reservation.attemptId} for plan ${params.planId}: plan status is ${row.planStatus}.`,
    );
  }

  return undefined;
}

async function runGeneration(
  dbClient: DbClient,
  params: GenerationRunParams,
): Promise<GenerationRunResult> {
  const finalizedReservation = await validateReservation(dbClient, params);
  if (finalizedReservation) {
    return finalizedReservation;
  }

  const generationPurpose = parseGenerationPurpose(params.generationPurpose);
  const { provider } = resolveModelForTier(
    params.tier,
    params.modelOverride ?? undefined,
    modelOperationForGenerationPurpose(generationPurpose),
  );

  const generationInput: GenerationInput = {
    topic: params.input.topic,
    skillLevel: params.input.skillLevel,
    weeklyHours: params.input.weeklyHours,
    learningStyle: params.input.learningStyle,
    startDate: params.input.startDate,
    deadlineDate: params.input.deadlineDate,
    notes: params.input.notes,
  };

  const exec = await runGenerationExecution(
    {
      planId: params.planId,
      userId: params.userId,
      input: generationInput,
      generationPurpose,
    },
    {
      provider,
      dbClient,
      signal: params.signal,
      ...(params.allowedGenerationStatuses !== undefined
        ? { allowedGenerationStatuses: params.allowedGenerationStatuses }
        : {}),
      ...(params.requiredGenerationStatus !== undefined
        ? { requiredGenerationStatus: params.requiredGenerationStatus }
        : {}),
      ...(params.onAttemptReserved !== undefined
        ? { onAttemptReserved: params.onAttemptReserved }
        : {}),
      ...(params.reservation !== undefined
        ? { reservation: params.reservation }
        : {}),
      ...(params.modelOverride !== undefined
        ? { modelOverride: params.modelOverride }
        : {}),
    },
  );

  if (exec.kind === 'failure_rejected') {
    const result = exec.result;
    return {
      status: 'failure',
      classification: result.classification,
      error: result.error,
      metadata: result.metadata,
      usage: result.metadata ? safeNormalizeUsage(result.metadata) : undefined,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      extendedTimeout: result.extendedTimeout,
      ...(result.reservationRejectionReason !== undefined
        ? { reservationRejectionReason: result.reservationRejectionReason }
        : {}),
    };
  }

  if (exec.kind === 'failure_reserved') {
    return {
      status: 'failure',
      classification: exec.classification,
      error: exec.error,
      metadata: exec.metadata,
      usage: exec.metadata ? safeNormalizeUsage(exec.metadata) : undefined,
      durationMs: exec.durationMs,
      reservation: exec.reservation,
      timedOut: exec.timedOut,
      extendedTimeout: exec.extendedTimeout,
    };
  }

  return {
    status: 'success',
    modules: exec.modules as GeneratedModule[],
    metadata: exec.metadata,
    usage: safeNormalizeUsage(exec.metadata),
    durationMs: exec.durationMs,
    reservation: exec.reservation,
    extendedTimeout: exec.extendedTimeout,
  };
}

export function createPlanLifecycleGeneration(
  dbClient: DbClient,
): PlanLifecycleGeneration {
  return {
    runGeneration: (params) => runGeneration(dbClient, params),
  };
}
