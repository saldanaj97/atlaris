import type { PlanGenerationWorkflowInput } from './plan-generation.types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';

import { fromSerializableReservation } from './plan-generation.types';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { runPlanGenerationAfterReservation } from '@/features/plans/run-plan-generation-after-reservation';
import { generationAttempts } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { eq, sql } from 'drizzle-orm';
import { getWorkflowMetadata } from 'workflow';

async function mergeAttemptWorkflowMetadata(
  attemptId: string,
  workflowPatch: Record<string, string>,
): Promise<void> {
  const patchJson = JSON.stringify(workflowPatch);

  await serviceRoleDb
    .update(generationAttempts)
    .set({
      metadata: sql`jsonb_set(
        coalesce(${generationAttempts.metadata}, '{}'::jsonb),
        '{workflow}',
        coalesce(${generationAttempts.metadata}->'workflow', '{}'::jsonb) || ${patchJson}::jsonb
      )`,
    })
    .where(eq(generationAttempts.id, attemptId));
}

export async function persistPlanGenerationWorkflowMetadataStep(
  input: PlanGenerationWorkflowInput,
): Promise<void> {
  'use step';

  const { workflowRunId: runId } = getWorkflowMetadata();

  await mergeAttemptWorkflowMetadata(input.reservation.attemptId, {
    provider: 'workflow-sdk',
    runId,
    startedAt: input.reservation.startedAt,
  });
}

export async function runPlanGenerationStep(
  input: PlanGenerationWorkflowInput,
): Promise<GenerationAttemptResult> {
  'use step';

  const lifecycle = createPlanLifecycleService({ dbClient: serviceRoleDb });
  const reservation = fromSerializableReservation(input.reservation);
  const { workflowRunId: runId } = getWorkflowMetadata();

  const result = await runPlanGenerationAfterReservation({
    input: {
      planId: input.planId,
      userId: input.userId,
      tier: input.tier,
      input: input.input,
      modelOverride: input.modelOverride ?? undefined,
      allowedGenerationStatuses: input.allowedGenerationStatuses,
      requiredGenerationStatus: input.requiredGenerationStatus,
      workflowMetadata: {
        provider: 'workflow-sdk',
        runId,
        startedAt: input.reservation.startedAt,
      },
    },
    reservation,
    lifecycleService: lifecycle,
  });

  return result;
}
