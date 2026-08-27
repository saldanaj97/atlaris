import type { SerializableAttemptReservation } from './plan-generation.types';
import type { Job } from '@/features/jobs/types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { RegenerationPlanRow } from '@/features/plans/regeneration-orchestration/process-workflow-support';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  fromSerializableReservation,
  toSerializableReservation,
} from './plan-generation.types';
import {
  resolvePlanRegenerationWorkflowPurpose,
  type PlanRegenerationWorkflowClaimResult,
  type PlanRegenerationWorkflowInput,
  type PlanRegenerationWorkflowTerminalResult,
} from './plan-regeneration.types';
import { resolveOverrideOrSavedModelId } from '@/features/ai/model-preferences';
import { validateModelForTier } from '@/features/ai/model-resolver';
import { reserveRegenerationQuotaAtProviderStart } from '@/features/billing/regeneration-quota-boundary';
import { resolveUserTier } from '@/features/billing/tier';
import {
  claimRegenerationJob,
  failJob,
  loadJobById,
  updateJobPayload,
  updateJobPayloadIfRunIdMissing,
} from '@/features/jobs/queue';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { resolveRegenerationPolicyDenial } from '@/features/plans/regeneration-orchestration/admission';
import { createDefaultRegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import {
  applyRegenerationGenerationResult,
  buildRegenerationGenerationInput,
  failRegenerationJobForMissingPlanInWorkflow,
  loadAuthorizedRegenerationPlan,
  validateQueuedRegenerationPayloadForJob,
} from '@/features/plans/regeneration-orchestration/process-workflow-support';
import { planRegenerationJobPayloadSchema } from '@/features/plans/regeneration-orchestration/schema';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { getUserPreferences } from '@/lib/db/queries/user-preferences';
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

  if (job.status === 'processing' && !existingRunId) {
    const adopted = await updateJobPayloadIfRunIdMissing(job.id, payload);
    if (adopted?.status === 'completed') {
      return { kind: 'already-completed', jobId: job.id };
    }
    if (adopted?.status === 'failed') {
      return { kind: 'already-failed', jobId: job.id };
    }
    if (adopted?.status === 'processing') {
      const adoptedRunId = adopted.data.workflow?.runId;
      if (adoptedRunId === runId) {
        return { kind: 'claimed', runId };
      }
      if (adoptedRunId) {
        return { kind: 'in-flight', jobId: job.id, runId: adoptedRunId };
      }
    }
    return { kind: 'job-not-found', jobId: input.jobId };
  }

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
      if (run === runId) {
        return { kind: 'claimed', runId };
      }
      if (run) {
        return { kind: 'in-flight', jobId: job.id, runId: run };
      }
    }
    return { kind: 'job-not-found', jobId: input.jobId };
  }

  return { kind: 'claimed', runId };
}

type PreparedRegeneration = {
  readonly job: Job;
  readonly plan: RegenerationPlanRow;
  readonly tier: SubscriptionTier;
  readonly generationInput: GenerationInput;
  readonly modelOverride?: string;
};

async function prepareRegeneration(
  input: PlanRegenerationWorkflowInput,
): Promise<PreparedRegeneration> {
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
  const policyDenial = resolveRegenerationPolicyDenial({
    tier,
    weeklyHours: generationInput.weeklyHours,
    startDate: generationInput.startDate,
    deadlineDate: generationInput.deadlineDate,
  });
  if (policyDenial) {
    const message =
      policyDenial.kind === 'not-included'
        ? 'Plan regeneration is not included on the Free plan.'
        : policyDenial.reason;
    await failJob(job.id, message, { retryable: false });
    throw new FatalError(message);
  }

  const explicitModel = validation.payload.overrides?.model;
  if (explicitModel !== undefined) {
    const modelValidation = validateModelForTier(
      tier,
      explicitModel,
      'regeneration',
    );
    if (!modelValidation.valid) {
      const message = 'Model is not allowed for regeneration on this tier.';
      await failJob(job.id, message, { retryable: false });
      throw new FatalError(message);
    }
  }

  const saved = await getUserPreferences(plan.userId, serviceRoleDb);
  const modelOverride = resolveOverrideOrSavedModelId(
    validation.payload.overrides?.model,
    tier,
    saved,
    'regeneration',
  );

  return {
    job,
    plan,
    tier,
    generationInput,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
  };
}

export async function reservePlanRegenerationAttemptStep(
  input: PlanRegenerationWorkflowInput,
): Promise<SerializableAttemptReservation> {
  'use step';

  const prepared = await prepareRegeneration(input);
  const generationPurpose = resolvePlanRegenerationWorkflowPurpose(input);
  const reservation = await reserveAttemptSlot({
    planId: prepared.plan.id,
    userId: prepared.plan.userId,
    input: prepared.generationInput,
    generationPurpose,
    dbClient: serviceRoleDb,
  });

  if (!reservation.reserved) {
    throw new FatalError(
      `Unable to reserve regeneration attempt: ${reservation.reason}.`,
    );
  }

  return toSerializableReservation(reservation);
}

export async function processPlanRegenerationStep(
  input: PlanRegenerationWorkflowInput,
  serializedReservation: SerializableAttemptReservation,
): Promise<GenerationAttemptResult> {
  'use step';

  const prepared = await prepareRegeneration(input);
  const { job, plan, tier, generationInput, modelOverride } = prepared;
  const generationPurpose = resolvePlanRegenerationWorkflowPurpose(input);
  const lifecycle = createPlanLifecycleService({ dbClient: serviceRoleDb });

  let quotaDenied = false;
  const generationResult =
    await lifecycle.processGenerationAttemptWithReservation(
      {
        planId: plan.id,
        userId: plan.userId,
        tier,
        generationPurpose,
        input: generationInput,
        ...(modelOverride !== undefined ? { modelOverride } : {}),
        onAttemptReserved: async () => {
          const quotaResult = await reserveRegenerationQuotaAtProviderStart({
            userId: plan.userId,
            planId: plan.id,
            jobId: job.id,
            dbClient: serviceRoleDb,
          });
          if (!quotaResult.ok) {
            quotaDenied = true;
            throw new Error(
              'Regeneration quota exceeded for your subscription tier.',
            );
          }
        },
      },
      fromSerializableReservation(serializedReservation, generationPurpose),
    );

  if (quotaDenied) {
    const message = 'Regeneration quota exceeded for your subscription tier.';
    await failJob(job.id, message, { retryable: false });
    throw new FatalError(message);
  }

  return generationResult;
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
