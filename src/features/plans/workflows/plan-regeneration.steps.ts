import type { Job } from '@/features/jobs/types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { RegenerationPlanRow } from '@/features/plans/regeneration-orchestration/process-workflow-support';
import type { PlanRegenerationJobPayload } from '@/features/plans/regeneration-orchestration/schema';
import type {
  AttemptRejection,
  AttemptReservation,
} from '@/lib/db/queries/types/attempts.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  fromSerializableReservation,
  toSerializableReservation,
} from './plan-generation.types';
import {
  resolvePlanRegenerationWorkflowPurpose,
  type PlanRegenerationAttemptPreparation,
  type PlanRegenerationWorkflowClaimResult,
  type PlanRegenerationWorkflowInput,
  type PlanRegenerationReservationStepResult,
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
import { commitPlanGenerationFailure } from '@/features/plans/lifecycle/generation-finalization/store';
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
import {
  findAttemptWithWorkflowIdempotencyKey,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
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

type LoadedRegeneration = Pick<
  PreparedRegeneration,
  'job' | 'plan' | 'generationInput'
> & {
  readonly payload: PlanRegenerationJobPayload;
};

type ReservationForCompensation = AttemptReservation & {
  readonly status?: 'in_progress' | 'success' | 'failure';
};

class RegenerationAdmissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegenerationAdmissionDeniedError';
  }
}

function regenerationReservationIdempotencyKey(
  jobId: string,
  queueAttempt: number,
): string {
  return `plan-regeneration:${jobId}:${queueAttempt}`;
}

async function loadRegenerationContext(
  input: PlanRegenerationWorkflowInput,
): Promise<LoadedRegeneration> {
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

  const generationInput = buildRegenerationGenerationInput(
    validation.payload,
    plan,
  );

  return { job, plan, generationInput, payload: validation.payload };
}

async function prepareRegeneration(
  input: PlanRegenerationWorkflowInput,
  loaded?: LoadedRegeneration,
  admittedTier?: SubscriptionTier,
): Promise<PreparedRegeneration> {
  const context = loaded ?? (await loadRegenerationContext(input));
  const { plan, generationInput, payload } = context;
  const tier =
    admittedTier ?? (await resolveUserTier(plan.userId, serviceRoleDb));
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
    throw new RegenerationAdmissionDeniedError(message);
  }

  const explicitModel = payload.overrides?.model;
  if (explicitModel !== undefined) {
    const modelValidation = validateModelForTier(
      tier,
      explicitModel,
      'regeneration',
    );
    if (!modelValidation.valid) {
      const message = 'Model is not allowed for regeneration on this tier.';
      throw new RegenerationAdmissionDeniedError(message);
    }
  }

  const saved = await getUserPreferences(plan.userId, serviceRoleDb);
  const modelOverride = resolveOverrideOrSavedModelId(
    payload.overrides?.model,
    tier,
    saved,
    'regeneration',
  );

  return {
    ...context,
    tier,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
  };
}

async function failPreReservationAdmission(
  jobId: string,
  error: RegenerationAdmissionDeniedError,
): Promise<never> {
  await failJob(jobId, error.message, { retryable: false });
  throw new FatalError(error.message);
}

async function compensatePostReservationAdmission(
  input: PlanRegenerationWorkflowInput,
  reservation: ReservationForCompensation,
  workflowMetadata: {
    readonly provider: 'workflow-sdk';
    readonly runId: string;
    readonly idempotencyKey: string;
  },
  error: RegenerationAdmissionDeniedError,
): Promise<never> {
  const generationPurpose = resolvePlanRegenerationWorkflowPurpose(input);
  if (
    reservation.status === undefined ||
    reservation.status === 'in_progress'
  ) {
    await commitPlanGenerationFailure(serviceRoleDb, {
      variant: 'reserved_attempt',
      planId: input.planId,
      userId: input.userId,
      attemptId: reservation.attemptId,
      preparation: reservation,
      classification: 'validation',
      error,
      durationMs: 0,
      timedOut: false,
      extendedTimeout: false,
      workflowMetadata: {
        ...workflowMetadata,
        startedAt: reservation.startedAt.toISOString(),
      },
      generationPurpose,
      usageKind: 'plan',
      retryable: false,
    });
  }

  await failJob(input.jobId, error.message, { retryable: false });
  throw new FatalError(error.message);
}

function isRetryableReservationRejection(
  reason: AttemptRejection['reason'],
): boolean {
  switch (reason) {
    case 'active_child_generation':
    case 'free_initial_in_progress':
    case 'in_progress':
    case 'rate_limited':
      return true;
    case 'capped':
    case 'free_allowance_used':
    case 'invalid_status':
    case 'plan_limit':
      return false;
    default: {
      const _never: never = reason;
      return _never;
    }
  }
}

async function terminalizeReservationRejection(
  input: PlanRegenerationWorkflowInput,
  reservation: AttemptRejection,
): Promise<PlanRegenerationWorkflowTerminalResult> {
  const message = `Unable to reserve regeneration attempt: ${reservation.reason}.`;
  const retryable = isRetryableReservationRejection(reservation.reason);
  const failedJob = await failJob(input.jobId, message, { retryable });

  return retryable
    ? {
        kind: 'retryable-failure',
        jobId: input.jobId,
        planId: input.planId,
        willRetry: failedJob?.status === 'pending',
      }
    : {
        kind: 'permanent-failure',
        jobId: input.jobId,
        planId: input.planId,
      };
}

export async function reservePlanRegenerationAttemptStep(
  input: PlanRegenerationWorkflowInput,
): Promise<PlanRegenerationReservationStepResult> {
  'use step';

  const loaded = await loadRegenerationContext(input);
  const generationPurpose = resolvePlanRegenerationWorkflowPurpose(input);
  const idempotencyKey = regenerationReservationIdempotencyKey(
    loaded.job.id,
    loaded.job.attempts,
  );
  const { workflowRunId: runId } = getWorkflowMetadata();
  const workflowMetadata = {
    provider: 'workflow-sdk' as const,
    runId,
    idempotencyKey,
  };
  const existingReservation = await findAttemptWithWorkflowIdempotencyKey({
    planId: loaded.plan.id,
    userId: loaded.plan.userId,
    input: loaded.generationInput,
    generationPurpose,
    workflowIdempotencyKey: idempotencyKey,
    dbClient: serviceRoleDb,
  });

  let preflight: PreparedRegeneration;
  try {
    preflight = await prepareRegeneration(
      input,
      loaded,
      existingReservation?.admittedTier,
    );
  } catch (error: unknown) {
    if (error instanceof RegenerationAdmissionDeniedError) {
      if (existingReservation) {
        return compensatePostReservationAdmission(
          input,
          existingReservation,
          workflowMetadata,
          error,
        );
      }
      return failPreReservationAdmission(loaded.job.id, error);
    }
    throw error;
  }

  const reservation = await reserveAttemptSlot({
    planId: loaded.plan.id,
    userId: loaded.plan.userId,
    input: loaded.generationInput,
    generationPurpose,
    dbClient: serviceRoleDb,
    workflowMetadata,
  });

  if (!reservation.reserved) {
    return terminalizeReservationRejection(input, reservation);
  }

  let prepared = preflight;
  if (
    existingReservation === null &&
    reservation.admittedTier !== undefined &&
    reservation.admittedTier !== preflight.tier
  ) {
    try {
      prepared = await prepareRegeneration(
        input,
        loaded,
        reservation.admittedTier,
      );
    } catch (error: unknown) {
      if (error instanceof RegenerationAdmissionDeniedError) {
        return compensatePostReservationAdmission(
          input,
          reservation,
          workflowMetadata,
          error,
        );
      }
      throw error;
    }
  }

  return {
    reservation: toSerializableReservation(reservation),
    tier: prepared.tier,
    generationInput: prepared.generationInput,
    ...(prepared.modelOverride !== undefined
      ? { modelOverride: prepared.modelOverride }
      : {}),
  };
}

export async function processPlanRegenerationStep(
  input: PlanRegenerationWorkflowInput,
  preparation: PlanRegenerationAttemptPreparation,
): Promise<GenerationAttemptResult> {
  'use step';

  const job = await loadJobById(input.jobId);
  if (!job) {
    throw new FatalError('Regeneration job not found during processing');
  }

  const { reservation, tier, generationInput, modelOverride } = preparation;
  const generationPurpose = resolvePlanRegenerationWorkflowPurpose(input);
  const { workflowRunId: runId } = getWorkflowMetadata();
  const lifecycle = createPlanLifecycleService({ dbClient: serviceRoleDb });

  let quotaDenied = false;
  const generationResult =
    await lifecycle.processGenerationAttemptWithReservation(
      {
        planId: input.planId,
        userId: input.userId,
        tier,
        generationPurpose,
        input: generationInput,
        ...(modelOverride !== undefined ? { modelOverride } : {}),
        workflowMetadata: {
          provider: 'workflow-sdk',
          runId,
          startedAt: reservation.startedAt,
          idempotencyKey: regenerationReservationIdempotencyKey(
            job.id,
            job.attempts,
          ),
        },
        onAttemptReserved: async () => {
          const quotaResult = await reserveRegenerationQuotaAtProviderStart({
            userId: input.userId,
            planId: input.planId,
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
      fromSerializableReservation(reservation, generationPurpose),
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
