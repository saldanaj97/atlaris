import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
/**
 * Plan regeneration run for the Cloudflare jobs Worker's queue consumer
 * (docs/architecture/regeneration-worker-runbook.md): claim (CAS) → reserve
 * attempt → process → finalize.
 *
 * `job_queue.payload.workflow` and the attempt's workflow metadata carry
 * `provider: 'cloudflare-queue'` with the queue message ID as `runId`; fatal
 * outcomes terminalize the job here; finalization starts module lessons
 * through the injected `startModuleLessons`.
 */
import type { EnqueueModuleLessonGenerationsDeps } from '@/features/lesson-content/progressive-enqueue';
import type { GenerationRunResult } from '@/features/plans/lifecycle/service';
import type {
  GeneratedModule,
  GenerationAttemptResult,
} from '@/features/plans/lifecycle/types';
import type { RegenerationPlanRow } from '@/features/plans/regeneration-orchestration/process-workflow-support';
import type { PlanRegenerationJobPayload } from '@/features/plans/regeneration-orchestration/schema';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type {
  PlanRegenerationWorkflowClaimResult,
  PlanRegenerationWorkflowResult,
  PlanRegenerationWorkflowTerminalResult,
} from '@/features/plans/workflows/plan-regeneration.types';
import type {
  AttemptRejection,
  AttemptReservation,
} from '@/lib/db/queries/types/attempts.types';
import type { DbClient } from '@/lib/db/types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  resolveGroundedWriterModelId,
  resolveOverrideOrSavedModelId,
} from '@/features/ai/model-preferences';
import { validateModelForTier } from '@/features/ai/model-resolver';
import { sumUsages } from '@/features/ai/usage';
import { reserveRegenerationQuotaAtProviderStart } from '@/features/billing/regeneration-quota-boundary';
import { resolveUserTier } from '@/features/billing/tier';
import {
  claimRegenerationJob,
  failJob,
  loadJobById,
  updateJobPayload,
} from '@/features/jobs/queue';
import { JOB_TYPES, type Job } from '@/features/jobs/types';
import { toLessonResearch } from '@/features/lesson-content/grounded-lesson-writer';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { createGroundedOutlineProvider } from '@/features/plans/outline/grounded-writer';
import { resolveRegenerationPolicyDenial } from '@/features/plans/regeneration-orchestration/admission';
import { createDefaultRegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import {
  applyRegenerationGenerationResult,
  buildRegenerationGenerationInput,
  failRegenerationJobForMissingPlanInWorkflow,
  loadAuthorizedRegenerationPlan,
  validateQueuedRegenerationPayloadForJob,
} from '@/features/plans/regeneration-orchestration/process-workflow-support';
import { buildRegenerationGuidance } from '@/features/plans/regeneration-orchestration/reasons';
import { planRegenerationJobPayloadSchema } from '@/features/plans/regeneration-orchestration/schema';
import {
  findAttemptWithWorkflowIdempotencyKey,
  reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import { getLatestPlanResearch } from '@/lib/db/queries/plan-research';
import {
  getGroundedModelPreferences,
  getUserPreferences,
} from '@/lib/db/queries/user-preferences';
import { jobQueue, learningPlans } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { eq } from 'drizzle-orm';

export const PLAN_REGENERATION_FAILURE_MESSAGE =
  'Queued plan regeneration failed.';

const PROVIDER = 'cloudflare-queue' as const;
const GENERATION_PURPOSE = 'regeneration' as const;
const QUOTA_EXCEEDED_MESSAGE =
  'Regeneration quota exceeded for your subscription tier.';

export type RegenerationRunInput = {
  readonly jobId: string;
  readonly planId: string;
  readonly userId: string;
};

/** What a grounded regeneration's research and outline-quality stages see. */
export type GroundedRegenerationStageInput = {
  readonly planId: string;
  readonly tier: SubscriptionTier;
  readonly input: GenerationInput;
  /** Reasons and note as a prompt block (JCS-162), or `null`. */
  readonly guidance: string | null;
  /** Rows for the plan created from here on belong to this attempt. */
  readonly attemptStartedAt: string;
  readonly db: DbClient;
};

/**
 * Grounded regeneration stages (JCS-162), injected by the Worker: research
 * (JCS-158) and outline checks, verifier and repair (JCS-159).
 */
export type GroundedRegenerationStages = {
  /** The Worker's `groundedGeneration` switch for `tier`. */
  readonly isEnabled: (tier: SubscriptionTier) => boolean;
  /** Runs and saves research; `null` when it was skipped after its retries. */
  readonly research: (
    stage: GroundedRegenerationStageInput,
  ) => Promise<ResearchBrief | null>;
  /**
   * The outline to keep after checks, verifier and one repair, with the
   * usage of those calls.
   */
  readonly outlineQuality: (
    stage: GroundedRegenerationStageInput & {
      readonly modelOverride: string | null;
      readonly research: ResearchBrief | null;
    },
    modules: GeneratedModule[],
  ) => Promise<{
    readonly modules: GeneratedModule[];
    readonly usages: readonly CanonicalAIUsage[];
  }>;
};

export type RegenerationRunContext = {
  /** Queue message ID: stable across redeliveries of one message. */
  readonly runId: string;
  /** How finalization starts module lessons (the Worker injects a Cloudflare Workflow starter). */
  readonly startModuleLessons: NonNullable<
    EnqueueModuleLessonGenerationsDeps['start']
  >;
  /** Absent or switched off for the tier: today's regeneration. */
  readonly grounded?: GroundedRegenerationStages;
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
  readonly grounded: boolean;
  readonly modelOverride?: string;
  /** The grounded outline writer pick (JCS-169); legacy slots never apply. */
  readonly groundedWriterModelId: string | null;
};

type Preparation = {
  readonly reservation: AttemptReservation;
  readonly tier: SubscriptionTier;
  readonly grounded: boolean;
  readonly generationInput: GenerationInput;
  readonly payload: PlanRegenerationJobPayload;
  readonly modelOverride?: string;
  readonly groundedWriterModelId: string | null;
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
  context: RegenerationRunContext,
  admittedTier?: SubscriptionTier,
): Promise<PreparedRegeneration> {
  const { plan, generationInput, payload } = loaded;
  const tier =
    admittedTier ?? (await resolveUserTier(plan.userId, serviceRoleDb));
  const grounded = context.grounded?.isEnabled(tier) === true;
  const policyDenial = resolveRegenerationPolicyDenial({
    tier,
    grounded,
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
    !(await validateModelForTier(tier, explicitModel, 'regeneration')).valid
  ) {
    throw new RegenerationAdmissionDeniedError(
      'Model is not allowed for regeneration on this tier.',
    );
  }

  const [saved, groundedPicks] = await Promise.all([
    getUserPreferences(plan.userId, serviceRoleDb),
    grounded ? getGroundedModelPreferences(plan.userId, serviceRoleDb) : null,
  ]);
  const modelOverride = resolveOverrideOrSavedModelId(
    payload.overrides?.model,
    tier,
    saved,
    'regeneration',
  );

  return {
    ...loaded,
    tier,
    grounded,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    groundedWriterModelId: groundedPicks
      ? resolveGroundedWriterModelId(
          tier,
          payload.overrides?.model,
          groundedPicks,
        )
      : null,
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
      context,
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
      prepared = await prepareRegeneration(
        loaded,
        context,
        reservation.admittedTier,
      );
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
    grounded: prepared.grounded,
    generationInput: prepared.generationInput,
    payload: prepared.payload,
    ...(prepared.modelOverride !== undefined
      ? { modelOverride: prepared.modelOverride }
      : {}),
    groundedWriterModelId: prepared.groundedWriterModelId,
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

  const {
    reservation,
    tier,
    generationInput,
    modelOverride,
    groundedWriterModelId,
  } = preparation;
  const grounded = preparation.grounded ? context.grounded : undefined;
  const feedback = {
    reasons: preparation.payload.reasons ?? null,
    note: preparation.payload.note ?? null,
  };
  const guidance = grounded ? buildRegenerationGuidance(feedback) : null;
  const stage = (): GroundedRegenerationStageInput => ({
    planId: input.planId,
    tier,
    input: generationInput,
    guidance,
    attemptStartedAt: reservation.startedAt.toISOString(),
    db: serviceRoleDb,
  });

  // Grounded (JCS-162): the outline writer reads research the provider-start
  // callback produced, so it is created before research runs.
  let research: ResearchBrief | null = null;
  const generationProvider: AiPlanGenerationProvider | undefined = grounded
    ? {
        generate: (providerInput, options) =>
          createGroundedOutlineProvider({
            tier,
            purpose: GENERATION_PURPOSE,
            modelOverride: groundedWriterModelId,
            research,
            guidance,
          }).generate(providerInput, options),
        generateModuleLessonBatch: () =>
          Promise.reject(
            new Error('The grounded outline writer does not write lessons'),
          ),
      }
    : undefined;
  const lifecycle = createPlanLifecycleService({
    dbClient: serviceRoleDb,
    startModuleLessons: context.startModuleLessons,
    ...(generationProvider ? { generationProvider } : {}),
  });

  // Quota is consumed only once the provider is about to start: failures
  // before this callback leave quota untouched, later failures keep it consumed.
  // A grounded run counts research as provider work: Starter and Pro rerun it
  // steered by the feedback; Free reuses the plan's saved brief and sources.
  let quotaDenied = false;
  const processInput = {
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
        ...(grounded ? { groundedTier: tier } : {}),
      });
      if (!quotaResult.ok) {
        quotaDenied = true;
        throw new Error(QUOTA_EXCEEDED_MESSAGE);
      }
      if (grounded) {
        research = await loadRegenerationResearch(grounded, stage());
      }
    },
  };

  let generationResult: GenerationAttemptResult;
  if (grounded) {
    const run = await lifecycle.runGenerationWithReservation(
      processInput,
      reservation,
    );
    let toSettle: GenerationRunResult = run;
    if (run.status === 'success') {
      const quality = await grounded.outlineQuality(
        { ...stage(), modelOverride: groundedWriterModelId, research },
        run.modules,
      );
      // Verifier and repair spend counts toward the plan's AI ceiling (JCS-170).
      toSettle = {
        ...run,
        modules: quality.modules,
        usage: sumUsages([run.usage, ...quality.usages]),
      };
      // Before settlement, which starts the lessons that read it.
      await saveRegenerationFeedback(input.planId, feedback);
    }
    generationResult = await lifecycle.settleGenerationResult(
      processInput,
      toSettle,
    );
  } else {
    generationResult = await lifecycle.processGenerationAttemptWithReservation(
      processInput,
      reservation,
    );
  }

  if (quotaDenied) {
    await failJob(job.id, QUOTA_EXCEEDED_MESSAGE, { retryable: false });
    throw new RegenerationRunFatalError(QUOTA_EXCEEDED_MESSAGE);
  }

  return generationResult;
}

/**
 * Research for a grounded regeneration: paid tiers rerun it steered by the
 * feedback (`null` when it was skipped); Free reuses the plan's latest saved
 * brief and sources.
 */
async function loadRegenerationResearch(
  grounded: GroundedRegenerationStages,
  stage: GroundedRegenerationStageInput,
): Promise<ResearchBrief | null> {
  if (stage.tier !== 'free') {
    return grounded.research(stage);
  }
  return toLessonResearch(await getLatestPlanResearch(stage.planId, stage.db));
}

/** The reasons and note the lesson writer reads; `null` clears older ones. */
async function saveRegenerationFeedback(
  planId: string,
  feedback: {
    readonly reasons: readonly string[] | null;
    readonly note: string | null;
  },
): Promise<void> {
  await serviceRoleDb
    .update(learningPlans)
    .set({
      regenerationReasons: feedback.reasons ? [...feedback.reasons] : null,
      regenerationNote: feedback.note,
    })
    .where(eq(learningPlans.id, planId));
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
    await failJob(input.jobId, PLAN_REGENERATION_FAILURE_MESSAGE, {
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
 * Fails the job only when this run still owns it. A job that was never
 * claimed stays `pending` for the sweep. Returns whether the job was terminalized.
 */
export async function terminalizeAbandonedRegenerationRun(
  jobId: string,
  runId: string,
): Promise<boolean> {
  const job = await loadJobById(jobId);
  if (job?.status !== 'processing' || job.data.workflow?.runId !== runId) {
    return false;
  }
  await failJob(jobId, PLAN_REGENERATION_FAILURE_MESSAGE, {
    retryable: false,
  });
  return true;
}
