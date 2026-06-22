import type { PlanRegenerationWorkflowInput } from './plan-regeneration.types';
import type { PlanRegenerationWorkflowClaimResult } from './plan-regeneration.types';
import type { PlanRegenerationWorkflowTerminalResult } from './plan-regeneration.types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';

import { resolveUserTier } from '@/features/billing/tier';
import {
  claimRegenerationJob,
  loadJobById,
  updateJobPayload,
} from '@/features/jobs/queue';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { createDefaultRegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import {
  applyRegenerationGenerationResult,
  buildRegenerationGenerationInput,
  failRegenerationJobForMissingPlanInWorkflow,
  loadAuthorizedRegenerationPlan,
  validateQueuedRegenerationPayloadForJob,
} from '@/features/plans/regeneration-orchestration/process-workflow-support';
import { planRegenerationJobPayloadSchema } from '@/features/plans/regeneration-orchestration/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { FatalError, getWorkflowMetadata } from 'workflow';

export async function claimPlanRegenerationJobStep(
  input: PlanRegenerationWorkflowInput,
): Promise<PlanRegenerationWorkflowClaimResult> {
  'use step';

  const { workflowRunId: runId } = getWorkflowMetadata();
  const job = await loadJobById(input.jobId);

  if (!job) {
    return { kind: 'job-not-found', jobId: input.jobId };
  }

  const validation = await validateQueuedRegenerationPayloadForJob(job);
  if (!validation.ok) {
    return { kind: 'invalid-payload', jobId: input.jobId };
  }

  if (job.status === 'completed') {
    return { kind: 'already-completed', jobId: job.id };
  }

  if (job.status === 'failed') {
    return { kind: 'already-failed', jobId: job.id };
  }

  const existingRunId = validation.payload.workflow?.runId;
  if (job.status === 'processing' && existingRunId && existingRunId !== runId) {
    return { kind: 'in-flight', jobId: job.id, runId: existingRunId };
  }

  if (job.status === 'processing' && existingRunId === runId) {
    return { kind: 'claimed', runId };
  }

  const payload = planRegenerationJobPayloadSchema.parse({
    ...validation.payload,
    workflow: {
      provider: 'workflow-sdk' as const,
      runId,
      startedAt: new Date().toISOString(),
    },
  });

  const claimed = await claimRegenerationJob(
    job.id,
    {
      planId: input.planId,
      userId: input.userId,
    },
    payload,
  );

  if (!claimed) {
    const latest = await loadJobById(input.jobId);
    if (latest?.status === 'completed') {
      return { kind: 'already-completed', jobId: job.id };
    }
    if (latest?.status === 'processing') {
      const run = latest.data.workflow?.runId;
      if (run) {
        return { kind: 'in-flight', jobId: job.id, runId: run };
      }
    }
    return { kind: 'job-not-found', jobId: input.jobId };
  }

  return { kind: 'claimed', runId };
}

export async function processPlanRegenerationStep(
  input: PlanRegenerationWorkflowInput,
): Promise<GenerationAttemptResult> {
  'use step';

  const job = await loadJobById(input.jobId);
  if (!job) {
    throw new FatalError('Regeneration job not found during processing');
  }

  const validation = await validateQueuedRegenerationPayloadForJob(job);
  if (!validation.ok) {
    throw new FatalError('Regeneration job payload invalid during processing');
  }

  const planLoadDeps =
    createDefaultRegenerationOrchestrationDeps(serviceRoleDb);
  const plan = await loadAuthorizedRegenerationPlan(
    validation.payload,
    job,
    planLoadDeps,
  );
  if (!plan) {
    throw new FatalError('Plan not found for regeneration workflow');
  }

  const tier = await resolveUserTier(plan.userId, serviceRoleDb);
  const generationInput = buildRegenerationGenerationInput(
    validation.payload,
    plan,
  );
  const lifecycle = createPlanLifecycleService({ dbClient: serviceRoleDb });

  return lifecycle.processGenerationAttempt({
    planId: plan.id,
    userId: plan.userId,
    tier,
    input: generationInput,
  });
}

export async function finalizePlanRegenerationJobStep(
  input: PlanRegenerationWorkflowInput,
  generationResult: GenerationAttemptResult,
): Promise<PlanRegenerationWorkflowTerminalResult> {
  'use step';

  const deps = createDefaultRegenerationOrchestrationDeps(serviceRoleDb);
  const job = await loadJobById(input.jobId);
  if (!job) {
    throw new FatalError('Regeneration job not found during finalization');
  }

  if (job.status === 'completed') {
    return {
      kind: 'completed',
      jobId: job.id,
      planId: input.planId,
    };
  }

  if (job.status === 'failed') {
    return {
      kind: 'permanent-failure',
      jobId: job.id,
      planId: input.planId,
    };
  }

  const validation = await validateQueuedRegenerationPayloadForJob(job);
  if (!validation.ok) {
    throw new FatalError(
      'Regeneration job payload invalid during finalization',
    );
  }

  const plan = await loadAuthorizedRegenerationPlan(
    validation.payload,
    job,
    deps,
  );
  if (!plan) {
    await failRegenerationJobForMissingPlanInWorkflow(job.id, deps);
    return {
      kind: 'permanent-failure' as const,
      jobId: job.id,
      planId: input.planId,
    };
  }

  const { workflowRunId: runId } = getWorkflowMetadata();
  const completedPayload = planRegenerationJobPayloadSchema.parse({
    ...validation.payload,
    workflow: {
      provider: 'workflow-sdk' as const,
      runId,
      startedAt: validation.payload.workflow?.startedAt,
      completedAt: new Date().toISOString(),
    },
  });
  await updateJobPayload(job.id, completedPayload);

  return applyRegenerationGenerationResult(
    { job, plan },
    generationResult,
    deps,
  );
}
