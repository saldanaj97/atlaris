import { JOB_TYPES } from '@/features/jobs/types';
import { toPlanCalendarDate } from '@/features/plans/calendar-date';
import { buildPlanGenerationInputFields } from '@/features/plans/generation-input';
import { learningPlans } from '@/lib/db/schema';
import { db as serviceRoleDb } from '@/lib/db/service-role';
import { assertNever } from '@/lib/errors';
import { eq } from 'drizzle-orm';
import { createDefaultRegenerationOrchestrationDeps } from './deps';
import { planRegenerationJobPayloadSchema } from './schema';

import type { Job } from '@/features/jobs/types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle/types';
import type { RegenerationOrchestrationDeps } from './deps';
import type { PlanRegenerationJobPayload } from './schema';
import type { ProcessPlanRegenerationJobResult } from './types';

const INVALID_JOB_PAYLOAD_MESSAGE = 'Invalid plan regeneration job payload.';
const PLAN_NOT_FOUND_MESSAGE = 'Plan not found for queued regeneration.';
const UNSAFE_WORKER_FAILURE_MESSAGE = 'Queued plan regeneration failed.';

type RegenerationPlanRow = typeof learningPlans.$inferSelect;

type ValidatedJobPayload =
  | { ok: true; payload: PlanRegenerationJobPayload }
  | { ok: false; result: ProcessPlanRegenerationJobResult };

type GenerationOutcomeContext = {
  job: Job;
  plan: RegenerationPlanRow;
  deps: RegenerationOrchestrationDeps;
};

type GenerationSuccessResult = Extract<
  GenerationAttemptResult,
  { status: 'generation_success' }
>;
type RetryableFailureResult = Extract<
  GenerationAttemptResult,
  { status: 'retryable_failure' }
>;
type PermanentFailureResult = Extract<
  GenerationAttemptResult,
  { status: 'permanent_failure' }
>;

const resolveRegenerationNotes = (
  overrides: PlanRegenerationJobPayload['overrides'],
) => {
  if (!overrides || overrides.notes === undefined) {
    return undefined;
  }

  return overrides.notes;
};

const resolveDateOverride = (
  override: string | null | undefined,
  fallback: string | null,
) => toPlanCalendarDate(override === undefined ? fallback : override);

function buildSanitizedGenerationFailureMessage(
  classification: string,
): string {
  return `Plan regeneration failed (${classification}).`;
}

function buildGenerationInput(
  payload: PlanRegenerationJobPayload,
  plan: RegenerationPlanRow,
) {
  const overrides = payload.overrides;

  return buildPlanGenerationInputFields({
    topic: overrides?.topic ?? plan.topic,
    notes: resolveRegenerationNotes(overrides),
    skillLevel: overrides?.skillLevel ?? plan.skillLevel,
    weeklyHours: overrides?.weeklyHours ?? plan.weeklyHours,
    learningStyle: overrides?.learningStyle ?? plan.learningStyle,
    startDate: resolveDateOverride(overrides?.startDate, plan.startDate),
    deadlineDate: resolveDateOverride(
      overrides?.deadlineDate,
      plan.deadlineDate,
    ),
  });
}

async function validateQueuedRegenerationPayload(
  job: Job,
  deps: RegenerationOrchestrationDeps,
): Promise<ValidatedJobPayload> {
  const parsed = planRegenerationJobPayloadSchema.safeParse(job.data);
  if (!parsed.success) {
    await deps.queue.failJob(job.id, INVALID_JOB_PAYLOAD_MESSAGE, {
      retryable: false,
    });
    return { ok: false, result: { kind: 'invalid-payload', jobId: job.id } };
  }

  const payload = parsed.data;

  if (job.planId !== payload.planId) {
    deps.logger.error(
      {
        jobId: job.id,
        jobPlanId: job.planId,
        payloadPlanId: payload.planId,
      },
      'Queued plan regeneration job metadata mismatch',
    );
    await deps.queue.failJob(job.id, INVALID_JOB_PAYLOAD_MESSAGE, {
      retryable: false,
    });
    return { ok: false, result: { kind: 'invalid-payload', jobId: job.id } };
  }

  return { ok: true, payload };
}

async function loadAuthorizedQueuedPlan(
  payload: PlanRegenerationJobPayload,
  job: Job,
  deps: RegenerationOrchestrationDeps,
): Promise<RegenerationPlanRow | null> {
  const plan = await deps.dbClient.query.learningPlans.findFirst({
    where: eq(learningPlans.id, payload.planId),
  });

  if (!plan || plan.userId !== job.userId) {
    return null;
  }

  return plan;
}

async function failMissingOrUnauthorizedPlan(
  job: Job,
  deps: RegenerationOrchestrationDeps,
  planId: string,
): Promise<ProcessPlanRegenerationJobResult> {
  await deps.queue.failJob(job.id, PLAN_NOT_FOUND_MESSAGE, {
    retryable: false,
  });
  return {
    kind: 'plan-not-found-or-unauthorized',
    jobId: job.id,
    planId,
  };
}

function summarizeSuccessfulGeneration(result: GenerationSuccessResult) {
  const modules = result.data.modules;
  const durationMs =
    Number.isFinite(result.data.durationMs) && result.data.durationMs >= 0
      ? result.data.durationMs
      : 0;

  return {
    modulesCount: modules.length,
    tasksCount: modules.reduce(
      (total, module) => total + (module.tasks?.length ?? 0),
      0,
    ),
    durationMs,
  };
}

async function completeSuccessfulGeneration(
  context: GenerationOutcomeContext,
  result: GenerationSuccessResult,
): Promise<ProcessPlanRegenerationJobResult> {
  const { job, plan, deps } = context;
  const summary = summarizeSuccessfulGeneration(result);

  await deps.queue.completeJob(job.id, {
    planId: plan.id,
    ...summary,
  });

  return {
    kind: 'completed',
    jobId: job.id,
    planId: plan.id,
  };
}

async function applyRetryableFailure(
  context: GenerationOutcomeContext,
  result: RetryableFailureResult,
): Promise<ProcessPlanRegenerationJobResult> {
  const { job, plan, deps } = context;
  const failureMessage = buildSanitizedGenerationFailureMessage(
    result.classification,
  );

  const failedJob = await deps.queue.failJob(job.id, failureMessage, {
    retryable: true,
  });
  const willRetry = failedJob?.status === 'pending';
  const retryLogContext = {
    jobId: job.id,
    planId: plan.id,
    classification: result.classification,
    message: failureMessage,
    queueStatus: failedJob?.status ?? null,
    attemptNumber: failedJob?.attempts ?? job.attempts + 1,
    maxAttempts: failedJob?.maxAttempts ?? job.maxAttempts,
    willRetry,
  };

  deps.logger.info(
    retryLogContext,
    'Regeneration job retryable failure — queue outcome applied',
  );
  deps.logger.debug(
    {
      ...retryLogContext,
      error: result.error,
    },
    'Regeneration job retryable failure diagnostic',
  );

  return {
    kind: 'retryable-failure',
    jobId: job.id,
    planId: plan.id,
    willRetry,
  };
}

async function applyPermanentFailure(
  context: GenerationOutcomeContext,
  result: PermanentFailureResult,
): Promise<ProcessPlanRegenerationJobResult> {
  const { job, plan, deps } = context;
  deps.logger.error(
    {
      jobId: job.id,
      classification: result.classification,
      error: result.error,
    },
    'Regeneration job permanent failure',
  );

  await deps.queue.failJob(
    job.id,
    buildSanitizedGenerationFailureMessage(result.classification),
    {
      retryable: false,
    },
  );

  return {
    kind: 'permanent-failure',
    jobId: job.id,
    planId: plan.id,
  };
}

async function completeAlreadyFinalizedGeneration(
  context: GenerationOutcomeContext,
): Promise<ProcessPlanRegenerationJobResult> {
  const { job, plan, deps } = context;

  deps.logger.info(
    { jobId: job.id, planId: plan.id },
    'Regeneration job: plan already finalized — completing queue job idempotently',
  );
  await deps.queue.completeJob(job.id, {
    planId: plan.id,
    modulesCount: 0,
    tasksCount: 0,
    durationMs: 0,
  });

  return {
    kind: 'already-finalized',
    jobId: job.id,
    planId: plan.id,
  };
}

async function applyGenerationAttemptResult(
  context: GenerationOutcomeContext,
  result: GenerationAttemptResult,
): Promise<ProcessPlanRegenerationJobResult> {
  switch (result.status) {
    case 'generation_success':
      return completeSuccessfulGeneration(context, result);
    case 'retryable_failure':
      return applyRetryableFailure(context, result);
    case 'permanent_failure':
      return applyPermanentFailure(context, result);
    case 'already_finalized':
      return completeAlreadyFinalizedGeneration(context);
    default:
      assertNever(result);
  }
}

export async function processNextPlanRegenerationJob(
  deps?: RegenerationOrchestrationDeps,
): Promise<ProcessPlanRegenerationJobResult> {
  const d = deps ?? createDefaultRegenerationOrchestrationDeps(serviceRoleDb);
  const job = await d.queue.getNextJob([JOB_TYPES.PLAN_REGENERATION]);

  if (!job) {
    return { kind: 'no-job' };
  }

  return processPlanRegenerationJob(job, d);
}

export async function processPlanRegenerationJob(
  job: Job,
  deps?: RegenerationOrchestrationDeps,
): Promise<ProcessPlanRegenerationJobResult> {
  const d = deps ?? createDefaultRegenerationOrchestrationDeps(serviceRoleDb);

  /** Set after successful parse; available in `catch` for `permanent-failure` planId when the row lacks it. */
  let payload: PlanRegenerationJobPayload | undefined;

  try {
    const validation = await validateQueuedRegenerationPayload(job, d);
    if (!validation.ok) {
      return validation.result;
    }

    payload = validation.payload;

    const plan = await loadAuthorizedQueuedPlan(payload, job, d);
    if (!plan) {
      return failMissingOrUnauthorizedPlan(job, d, payload.planId);
    }

    const userTier = await d.tier.resolveUserTier(plan.userId, d.dbClient);
    const generationInput = buildGenerationInput(payload, plan);

    const result: GenerationAttemptResult =
      await d.lifecycle.service.processGenerationAttempt({
        planId: plan.id,
        userId: plan.userId,
        tier: userTier,
        input: generationInput,
      });

    return applyGenerationAttemptResult({ job, plan, deps: d }, result);
  } catch (error) {
    d.logger.error(
      { jobId: job.id, error },
      'Failed while processing queued plan regeneration job',
    );

    try {
      await d.queue.failJob(job.id, UNSAFE_WORKER_FAILURE_MESSAGE, {
        retryable: false,
      });
    } catch (secondaryError) {
      d.logger.error(
        { jobId: job.id, error: secondaryError },
        'Failed to persist failure state for queued plan regeneration job',
      );
    }

    const planIdForFailure = job.planId ?? payload?.planId;

    return {
      kind: 'permanent-failure',
      jobId: job.id,
      ...(planIdForFailure != null ? { planId: planIdForFailure } : {}),
    };
  }
}
