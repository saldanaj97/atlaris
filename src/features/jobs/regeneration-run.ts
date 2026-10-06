/**
 * Runtime-neutral plan regeneration run for the Cloudflare jobs Worker's queue
 * consumer (docs/architecture/regeneration-worker-runbook.md).
 *
 * Mirrors `planRegenerationWorkflow` and its steps
 * (`src/features/plans/workflows/plan-regeneration.steps.ts`): claim (CAS) →
 * reserve attempt → process → finalize. The steps import the Vercel Workflow
 * SDK, which cannot run on Workers, so this copy stays until B7 removes the
 * Vercel path. Keep the two in sync while both exist.
 *
 * Differences from the steps: `job_queue.payload.workflow` and the attempt's
 * workflow metadata carry `provider: 'cloudflare-queue'` with the queue
 * message ID as `runId`; fatal outcomes terminalize the job here (the Vercel
 * path does that when `run.returnValue` rejects); finalization starts module
 * lessons through the injected `startModuleLessons`.
 */
import type { EnqueueModuleLessonGenerationsDeps } from '@/features/lesson-content/progressive-enqueue';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { RegenerationPlanRow } from '@/features/plans/regeneration-orchestration/process-workflow-support';
import type { PlanRegenerationJobPayload } from '@/features/plans/regeneration-orchestration/schema';
import type {
  PlanRegenerationWorkflowClaimResult,
  PlanRegenerationWorkflowResult,
  PlanRegenerationWorkflowTerminalResult,
} from '@/features/plans/workflows/plan-regeneration.types';
import type {
  AttemptRejection,
  AttemptReservation,
} from '@/lib/db/queries/types/attempts.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

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
import { JOB_TYPES, type Job } from '@/features/jobs/types';
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
import { PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE } from '@/features/plans/start-plan-regeneration-workflow';
import {
  findAttemptWithWorkflowIdempotencyKey,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import { getUserPreferences } from '@/lib/db/queries/user-preferences';
import { jobQueue } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { eq } from 'drizzle-orm';

const PROVIDER = 'cloudflare-queue' as const;
const GENERATION_PURPOSE = 'regeneration' as const;
const QUOTA_EXCEEDED_MESSAGE =
  'Regeneration quota exceeded for your subscription tier.';

export type RegenerationRunInput = {
  readonly jobId: string;
  readonly planId: string;
  readonly userId: string;
};

export type RegenerationRunContext = {
  /** Queue message ID: stable across redeliveries of one message. */
  readonly runId: string;
  /** How finalization starts module lessons (B4 injects a skip-and-log starter). */
  readonly startModuleLessons: NonNullable<
    EnqueueModuleLessonGenerationsDeps['start']
  >;
};

/** A retryable failure the queue should redeliver once the job is due again. */
export type RegenerationRunResult =
  | PlanRegenerationWorkflowResult
  | {
      readonly kind: 'retry-scheduled';
      readonly jobId: string;
      readonly planId: string;
      readonly scheduledFor: Date;
    };

/** Ends the run; the job is terminalized as non-retryable. */
class RegenerationRunFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegenerationRunFatalError';
  }
}

class RegenerationAdmissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegenerationAdmissionDeniedError';
  }
}

type LoadedRegeneration = {
  readonly job: Job;
  readonly plan: RegenerationPlanRow;
  readonly generationInput: GenerationInput;
  readonly payload: PlanRegenerationJobPayload;
};

type PreparedRegeneration = LoadedRegeneration & {
  readonly tier: SubscriptionTier;
  readonly modelOverride?: string;
};

type Preparation = {
  readonly reservation: AttemptReservation;
  readonly tier: SubscriptionTier;
  readonly generationInput: GenerationInput;
  readonly modelOverride?: string;
};

type AttemptWorkflowMetadataBase = {
  readonly provider: typeof PROVIDER;
  readonly runId: string;
  readonly idempotencyKey: string;
};

function regenerationReservationIdempotencyKey(
  jobId: string,
  queueAttempt: number,
): string {
  return `plan-regeneration:${jobId}:${queueAttempt}`;
}

function runMetadata(runId: string, startedAt: string | undefined) {
  return {
    provider: PROVIDER,
    runId,
    ...(startedAt !== undefined ? { startedAt } : {}),
  };
}

export async function claimRegenerationRun(
  input: RegenerationRunInput,
  runId: string,
): Promise<PlanRegenerationWorkflowClaimResult> {
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
    workflow: runMetadata(runId, new Date().toISOString()),
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
    { planId: input.planId, userId: input.userId },
    payload,
  );
  if (!claimed) {
    const latest = await loadJobById(input.jobId);
    if (latest?.status === 'completed') {
      return { kind: 'already-completed', jobId: job.id };
    }
    if (latest?.status === 'processing') {
      const latestRunId = latest.data.workflow?.runId;
      if (latestRunId === runId) {
        return { kind: 'claimed', runId };
      }
      if (latestRunId) {
        return { kind: 'in-flight', jobId: job.id, runId: latestRunId };
      }
    }
    return { kind: 'job-not-found', jobId: input.jobId };
  }

  return { kind: 'claimed', runId };
}

async function loadRegenerationContext(
  input: RegenerationRunInput,
): Promise<LoadedRegeneration> {
  const job = await loadJobById(input.jobId);
  if (!job) {
    throw new RegenerationRunFatalError(
      'Regeneration job not found during processing',
    );
  }

  const validation = await validateQueuedRegenerationPayloadForJob(job);
  if (!validation.ok) {
    throw new RegenerationRunFatalError(
      'Regeneration job payload invalid during processing',
    );
  }

  const plan = await loadAuthorizedRegenerationPlan(
    validation.payload,
    job,
    createDefaultRegenerationOrchestrationDeps(serviceRoleDb),
  );
  if (!plan) {
    throw new RegenerationRunFatalError(
      'Plan not found for regeneration workflow',
    );
  }

  return {
    job,
    plan,
    generationInput: buildRegenerationGenerationInput(validation.payload, plan),
    payload: validation.payload,
  };
}

async function prepareRegeneration(
  loaded: LoadedRegeneration,
  admittedTier?: SubscriptionTier,
): Promise<PreparedRegeneration> {
  const { plan, generationInput, payload } = loaded;
  const tier =
    admittedTier ?? (await resolveUserTier(plan.userId, serviceRoleDb));
  const policyDenial = resolveRegenerationPolicyDenial({
    tier,
    startDate: generationInput.startDate,
    deadlineDate: generationInput.deadlineDate,
  });
  if (policyDenial) {
    throw new RegenerationAdmissionDeniedError(
      policyDenial.kind === 'not-included'
        ? 'Plan regeneration is not included on the Free plan.'
        : policyDenial.reason,
    );
  }

  const explicitModel = payload.overrides?.model;
  if (
    explicitModel !== undefined &&
    !validateModelForTier(tier, explicitModel, 'regeneration').valid
  ) {
    throw new RegenerationAdmissionDeniedError(
      'Model is not allowed for regeneration on this tier.',
    );
  }

  const saved = await getUserPreferences(plan.userId, serviceRoleDb);
  const modelOverride = resolveOverrideOrSavedModelId(
    payload.overrides?.model,
    tier,
    saved,
    'regeneration',
  );

  return {
    ...loaded,
    tier,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
  };
}

async function failPreReservationAdmission(
  jobId: string,
  error: RegenerationAdmissionDeniedError,
): Promise<never> {
  await failJob(jobId, error.message, { retryable: false });
  throw new RegenerationRunFatalError(error.message);
}

async function compensatePostReservationAdmission(
  input: RegenerationRunInput,
  reservation: AttemptReservation & {
    readonly status?: 'in_progress' | 'success' | 'failure';
  },
  workflowMetadata: AttemptWorkflowMetadataBase,
  error: RegenerationAdmissionDeniedError,
  startModuleLessons: RegenerationRunContext['startModuleLessons'],
): Promise<never> {
  if (
    reservation.status === undefined ||
    reservation.status === 'in_progress'
  ) {
    const lifecycle = createPlanLifecycleService({
      dbClient: serviceRoleDb,
      startModuleLessons,
    });
    await lifecycle.settleReservedAttemptFailure({
      reservation,
      planId: input.planId,
      userId: input.userId,
      error,
      classification: 'validation',
      generationPurpose: GENERATION_PURPOSE,
      retryable: false,
      durationMs: 0,
      timedOut: false,
      extendedTimeout: false,
      workflowMetadata: {
        ...workflowMetadata,
        startedAt: reservation.startedAt.toISOString(),
      },
    });
  }

  await failJob(input.jobId, error.message, { retryable: false });
  throw new RegenerationRunFatalError(error.message);
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
  input: RegenerationRunInput,
  reservation: AttemptRejection,
): Promise<PlanRegenerationWorkflowTerminalResult> {
  const message = `Unable to reserve regeneration attempt: ${reservation.reason}.`;
  const retryable = isRetryableReservationRejection(reservation.reason);
  const failedJob = await failJob(input.jobId, message, {
    retryable,
    ...(reservation.retryAfter !== undefined
      ? { retryAfter: reservation.retryAfter }
      : {}),
  });

  return retryable
    ? {
        kind: 'retryable-failure',
        jobId: input.jobId,
        planId: input.planId,
        willRetry: failedJob?.status === 'pending',
      }
    : { kind: 'permanent-failure', jobId: input.jobId, planId: input.planId };
}

export async function reserveRegenerationRunAttempt(
  input: RegenerationRunInput,
  context: RegenerationRunContext,
): Promise<Preparation | PlanRegenerationWorkflowTerminalResult> {
  const loaded = await loadRegenerationContext(input);
  const idempotencyKey = regenerationReservationIdempotencyKey(
    loaded.job.id,
    loaded.job.attempts,
  );
  const workflowMetadata: AttemptWorkflowMetadataBase = {
    provider: PROVIDER,
    runId: context.runId,
    idempotencyKey,
  };
  const existingReservation = await findAttemptWithWorkflowIdempotencyKey({
    planId: loaded.plan.id,
    userId: loaded.plan.userId,
    input: loaded.generationInput,
    generationPurpose: GENERATION_PURPOSE,
    workflowIdempotencyKey: idempotencyKey,
    dbClient: serviceRoleDb,
  });

  let preflight: PreparedRegeneration;
  try {
    preflight = await prepareRegeneration(
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
          context.startModuleLessons,
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
    generationPurpose: GENERATION_PURPOSE,
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
      prepared = await prepareRegeneration(loaded, reservation.admittedTier);
    } catch (error: unknown) {
      if (error instanceof RegenerationAdmissionDeniedError) {
        return compensatePostReservationAdmission(
          input,
          reservation,
          workflowMetadata,
          error,
          context.startModuleLessons,
        );
      }
      throw error;
    }
  }

  return {
    reservation,
    tier: prepared.tier,
    generationInput: prepared.generationInput,
    ...(prepared.modelOverride !== undefined
      ? { modelOverride: prepared.modelOverride }
      : {}),
  };
}

export async function processRegenerationRun(
  input: RegenerationRunInput,
  preparation: Preparation,
  context: RegenerationRunContext,
): Promise<GenerationAttemptResult> {
  const job = await loadJobById(input.jobId);
  if (!job) {
    throw new RegenerationRunFatalError(
      'Regeneration job not found during processing',
    );
  }

  const { reservation, tier, generationInput, modelOverride } = preparation;
  const lifecycle = createPlanLifecycleService({
    dbClient: serviceRoleDb,
    startModuleLessons: context.startModuleLessons,
  });

  // Quota is consumed only once the provider is about to start: failures
  // before this callback leave quota untouched, later failures keep it consumed.
  let quotaDenied = false;
  const generationResult =
    await lifecycle.processGenerationAttemptWithReservation(
      {
        planId: input.planId,
        userId: input.userId,
        tier,
        generationPurpose: GENERATION_PURPOSE,
        input: generationInput,
        ...(modelOverride !== undefined ? { modelOverride } : {}),
        workflowMetadata: {
          provider: PROVIDER,
          runId: context.runId,
          startedAt: reservation.startedAt.toISOString(),
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
            throw new Error(QUOTA_EXCEEDED_MESSAGE);
          }
        },
      },
      reservation,
    );

  if (quotaDenied) {
    await failJob(job.id, QUOTA_EXCEEDED_MESSAGE, { retryable: false });
    throw new RegenerationRunFatalError(QUOTA_EXCEEDED_MESSAGE);
  }

  return generationResult;
}

export async function finalizeRegenerationRun(
  input: RegenerationRunInput,
  generationResult: GenerationAttemptResult,
  runId: string,
): Promise<PlanRegenerationWorkflowTerminalResult> {
  const deps = createDefaultRegenerationOrchestrationDeps(serviceRoleDb);
  const job = await loadJobById(input.jobId);
  if (!job) {
    throw new RegenerationRunFatalError(
      'Regeneration job not found during finalization',
    );
  }

  if (job.status === 'completed') {
    return { kind: 'completed', jobId: job.id, planId: input.planId };
  }
  if (job.status === 'failed') {
    return { kind: 'permanent-failure', jobId: job.id, planId: input.planId };
  }

  const validation = await validateQueuedRegenerationPayloadForJob(job);
  if (!validation.ok) {
    throw new RegenerationRunFatalError(
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
    return { kind: 'permanent-failure', jobId: job.id, planId: input.planId };
  }

  await updateJobPayload(
    job.id,
    planRegenerationJobPayloadSchema.parse({
      ...validation.payload,
      workflow: {
        ...runMetadata(runId, validation.payload.workflow?.startedAt),
        completedAt: new Date().toISOString(),
      },
    }),
  );

  return applyRegenerationGenerationResult(
    { job, plan },
    generationResult,
    deps,
  );
}

async function readJobScheduledFor(jobId: string): Promise<Date | null> {
  const [row] = await serviceRoleDb
    .select({ scheduledFor: jobQueue.scheduledFor })
    .from(jobQueue)
    .where(eq(jobQueue.id, jobId))
    .limit(1);
  return row?.scheduledFor ?? null;
}

async function withRetrySchedule(
  result: PlanRegenerationWorkflowTerminalResult,
): Promise<RegenerationRunResult> {
  if (result.kind !== 'retryable-failure' || !result.willRetry) {
    return result;
  }
  const scheduledFor = await readJobScheduledFor(result.jobId);
  return scheduledFor
    ? {
        kind: 'retry-scheduled',
        jobId: result.jobId,
        planId: result.planId,
        scheduledFor,
      }
    : result;
}

/**
 * Runs one regeneration job to a terminal or retry-scheduled outcome. Throws
 * only for unexpected errors (database or provider outages), which the
 * consumer retries; a redelivery of the same message resumes the same run.
 */
export async function runPlanRegeneration(
  jobId: string,
  context: RegenerationRunContext,
): Promise<RegenerationRunResult> {
  const job = await loadJobById(jobId);
  if (!job) {
    return { kind: 'job-not-found', jobId };
  }
  if (job.type !== JOB_TYPES.PLAN_REGENERATION || !job.planId) {
    return { kind: 'invalid-payload', jobId };
  }
  const input: RegenerationRunInput = {
    jobId,
    planId: job.planId,
    userId: job.userId,
  };

  try {
    const claim = await claimRegenerationRun(input, context.runId);
    if (claim.kind !== 'claimed') {
      return claim;
    }

    const preparation = await reserveRegenerationRunAttempt(input, context);
    if ('kind' in preparation) {
      return withRetrySchedule(preparation);
    }

    const generationResult = await processRegenerationRun(
      input,
      preparation,
      context,
    );
    return withRetrySchedule(
      await finalizeRegenerationRun(input, generationResult, context.runId),
    );
  } catch (error) {
    if (!(error instanceof RegenerationRunFatalError)) {
      throw error;
    }
    // Same terminal write as the Vercel path when a workflow run rejects.
    await failJob(input.jobId, PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE, {
      retryable: false,
    });
    return {
      kind: 'permanent-failure',
      jobId: input.jobId,
      planId: input.planId,
    };
  }
}

/**
 * Called after the queue's last delivery of a message failed unexpectedly.
 * Fails the job only when this run still owns it, matching the Vercel path's
 * terminal write when a workflow run rejects. A job that was never claimed
 * stays `pending` for the sweep. Returns whether the job was terminalized.
 */
export async function terminalizeAbandonedRegenerationRun(
  jobId: string,
  runId: string,
): Promise<boolean> {
  const job = await loadJobById(jobId);
  if (job?.status !== 'processing' || job.data.workflow?.runId !== runId) {
    return false;
  }
  await failJob(jobId, PLAN_REGENERATION_WORKFLOW_FAILURE_MESSAGE, {
    retryable: false,
  });
  return true;
}
