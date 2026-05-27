import type {
  ModuleLessonWorkflowClaimStepResult,
  ModuleLessonWorkflowInput,
} from './module-lesson-generation.types';
import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { classifyModuleLessonGenerationPreflight } from '@/features/lesson-content/module-lesson-generation-preflight';
import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import {
  claimModuleLessonGenerationOrDescribe,
  loadModuleLessonGenerationContext,
  persistModuleLessonWorkflowRunMetadata,
} from '@/lib/db/queries/module-lesson-generation';
import { db as serviceRoleDb } from '@supabase/service-role';
import { getWorkflowMetadata } from 'workflow';

export async function claimModuleLessonGenerationStep(
  input: ModuleLessonWorkflowInput,
): Promise<ModuleLessonWorkflowClaimStepResult> {
  'use step';

  const { workflowRunId: runId } = getWorkflowMetadata();

  const load = await loadModuleLessonGenerationContext(
    serviceRoleDb,
    input.planId,
    input.moduleId,
    input.userId,
  );

  const preflight = classifyModuleLessonGenerationPreflight(load);
  if (preflight.kind === 'not_found') {
    return { kind: 'not_found', runId };
  }
  if (preflight.kind === 'locked') {
    return { kind: 'locked', runId };
  }
  if (preflight.kind === 'already_ready') {
    return { kind: 'already_ready', runId };
  }
  if (preflight.kind === 'in_flight') {
    return { kind: 'in_flight', runId };
  }

  const claim = await claimModuleLessonGenerationOrDescribe(
    serviceRoleDb,
    input.planId,
    input.moduleId,
    input.userId,
  );

  if (claim.kind === 'already_ready') {
    return { kind: 'already_ready', runId };
  }
  if (claim.kind === 'in_flight') {
    return { kind: 'in_flight', runId };
  }
  if (claim.kind === 'not_found') {
    return { kind: 'not_found', runId };
  }
  if (preflight.kind !== 'eligible') {
    return { kind: 'in_flight', runId };
  }

  const claimedLoad = preflight.load;

  await persistModuleLessonWorkflowRunMetadata(serviceRoleDb, {
    userId: input.userId,
    planId: input.planId,
    moduleId: input.moduleId,
    runId,
    startedAt: new Date().toISOString(),
  });

  return { kind: 'claimed', runId, load: claimedLoad };
}

export async function runModuleLessonGenerationStep(
  input: ModuleLessonWorkflowInput,
  load: ModuleLessonGenerationContext,
  runId: string,
) {
  'use step';

  const generationMetadata = {
    version: 1 as const,
    workflow: {
      provider: 'workflow-sdk' as const,
      runId,
      startedAt: new Date().toISOString(),
    },
  };

  const result = await runModuleLessonGenerationWork(
    {
      load,
      userId: input.userId,
      planId: input.planId,
      moduleId: input.moduleId,
      userTier: input.userTier as SubscriptionTier,
      modelOverride: input.modelOverride,
      generationMetadata,
    },
    { serverDbClient: serviceRoleDb },
  );

  return { ...result, runId };
}
