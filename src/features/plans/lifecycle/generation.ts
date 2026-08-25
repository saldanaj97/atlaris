import type {
  GenerationRunParams,
  GenerationRunResult,
  PlanLifecycleGeneration,
} from './service';
import type { GeneratedModule } from './types';
import type { GenerationInput } from '@/features/ai/types/provider.types';
import type { DbClient } from '@/lib/db/types';

import { resolveModelForTier } from '@/features/ai/model-resolver';
import { runGenerationExecution } from '@/features/ai/orchestrator';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { parseGenerationPurpose } from '@/shared/types/generation-purpose';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { and, eq } from 'drizzle-orm';

async function validateReservation(
  dbClient: DbClient,
  params: GenerationRunParams,
): Promise<void> {
  if (!params.reservation) {
    return;
  }

  const [row] = await dbClient
    .select({
      attemptId: generationAttempts.id,
      attemptStatus: generationAttempts.status,
      generationPurpose: generationAttempts.generationPurpose,
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

  if (row.generationPurpose !== params.generationPurpose) {
    throw new Error(
      `Stale generation reservation ${params.reservation.attemptId} for plan ${params.planId}: purpose ${row.generationPurpose} does not match ${params.generationPurpose}.`,
    );
  }
}

async function runGeneration(
  dbClient: DbClient,
  params: GenerationRunParams,
): Promise<GenerationRunResult> {
  await validateReservation(dbClient, params);

  const { provider } = resolveModelForTier(
    params.tier,
    params.modelOverride ?? undefined,
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
      generationPurpose: parseGenerationPurpose(params.generationPurpose),
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
