import type { PlanGenerationWorkflowInput } from './plan-generation.types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';

import {
  fromSerializableReservation,
  resolvePlanGenerationWorkflowPurpose,
  toPlanGenerationProcessInput,
} from './plan-generation.types';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { mergeAttemptWorkflowMetadata } from '@/lib/db/queries/attempts';
import { db as serviceRoleDb } from '@supabase/service-role';
import { getWorkflowMetadata } from 'workflow';

export async function persistPlanGenerationWorkflowMetadataStep(
  input: PlanGenerationWorkflowInput,
): Promise<void> {
  'use step';

  const { workflowRunId: runId } = getWorkflowMetadata();

  await mergeAttemptWorkflowMetadata(
    serviceRoleDb,
    input.reservation.attemptId,
    {
      provider: 'workflow-sdk',
      runId,
      startedAt: input.reservation.startedAt,
    },
  );
}

export async function runPlanGenerationStep(
  input: PlanGenerationWorkflowInput,
): Promise<GenerationAttemptResult> {
  'use step';

  const lifecycle = createPlanLifecycleService({ dbClient: serviceRoleDb });
  const generationPurpose = resolvePlanGenerationWorkflowPurpose(input);
  const reservation = fromSerializableReservation(
    input.reservation,
    generationPurpose,
  );
  const { workflowRunId: runId } = getWorkflowMetadata();

  const result = await lifecycle.processGenerationAttemptWithReservation(
    toPlanGenerationProcessInput(input, generationPurpose, {
      provider: 'workflow-sdk',
      runId,
      startedAt: input.reservation.startedAt,
    }),
    reservation,
  );

  return result;
}
