import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { resolveUserTier } from '@/features/billing/tier';
import { completeJob, failJob, getNextJob } from '@/features/jobs/queue';
import { JOB_TYPES } from '@/features/jobs/types';
import {
  createPlanLifecycleService,
  type GenerationAttemptResult,
  type JobQueuePort,
} from '@/features/plans/lifecycle';
import { shouldRetryJob } from '@/features/plans/retry-policy';
import { planRegenerationOverridesSchema } from '@/features/plans/validation/learningPlans';
import { learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { assertNever } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// No-op JobQueuePort — the worker manages job state directly via completeJob/failJob,
// and only uses processGenerationAttempt which does not touch the job queue port.
const noOpJobQueue: JobQueuePort = {
  enqueueJob: () => Promise.resolve(''),
  completeJob: () => Promise.resolve(),
  failJob: () => Promise.resolve(),
};

const lifecycleService = createPlanLifecycleService({
  dbClient: db,
  jobQueue: noOpJobQueue,
});

const planRegenerationJobPayloadSchema = z
  .object({
    planId: z.string().uuid(),
    overrides: planRegenerationOverridesSchema.optional(),
  })
  .strict();

type PlanRegenerationJobPayload = z.infer<
  typeof planRegenerationJobPayloadSchema
>;

type ProcessRegenerationJobResult = {
  processed: boolean;
  jobId?: string;
  status?: 'completed' | 'failed';
  reason?: string;
};

const toIsoDateString = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  return ISO_DATE_PATTERN.test(value) ? value : undefined;
};

const resolveRegenerationNotes = (
  overrides: PlanRegenerationJobPayload['overrides']
) => {
  if (!overrides || overrides.notes === undefined) {
    return undefined;
  }

  return overrides.notes;
};

function buildGenerationInput(
  payload: PlanRegenerationJobPayload,
  plan: typeof learningPlans.$inferSelect
) {
  const overrides = payload.overrides;

  // startDateValue/deadlineDateValue: overrides undefined → use plan; null → explicit clear. Do not use ?? or falsy.
  const startDateValue =
    overrides?.startDate === undefined ? plan.startDate : overrides.startDate;
  const deadlineDateValue =
    overrides?.deadlineDate === undefined
      ? plan.deadlineDate
      : overrides.deadlineDate;

  return {
    topic: overrides?.topic ?? plan.topic,
    notes: resolveRegenerationNotes(overrides),
    skillLevel: overrides?.skillLevel ?? plan.skillLevel,
    weeklyHours: overrides?.weeklyHours ?? plan.weeklyHours,
    learningStyle: overrides?.learningStyle ?? plan.learningStyle,
    startDate: toIsoDateString(startDateValue),
    deadlineDate: toIsoDateString(deadlineDateValue),
  };
}

async function processNextRegenerationJob(): Promise<ProcessRegenerationJobResult> {
  const job = await getNextJob([JOB_TYPES.PLAN_REGENERATION]);

  if (!job) {
    return { processed: false };
  }

  try {
    const payload = planRegenerationJobPayloadSchema.parse(job.data);

    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, payload.planId),
    });

    // Combined error is deliberate for security (prevents account/plan enumeration).
    // Distinguishable errors (missing vs wrong user) were intentionally suppressed;
    // change only after security review.
    if (!plan || plan.userId !== job.userId) {
      await failJob(job.id, 'Plan not found for queued regeneration.', {
        retryable: false,
      });
      return {
        processed: true,
        jobId: job.id,
        status: 'failed',
        reason: 'plan_missing',
      };
    }

    const userTier = await resolveUserTier(plan.userId, db);
    const generationInput = buildGenerationInput(payload, plan);

    const result: GenerationAttemptResult =
      await lifecycleService.processGenerationAttempt({
        planId: plan.id,
        userId: plan.userId,
        tier: userTier,
        input: generationInput,
      });

    switch (result.status) {
      case 'generation_success': {
        const modules = result.data.modules;
        const modulesCount = modules.length;
        const tasksCount = modules.reduce(
          (total, m) => total + (m.tasks?.length ?? 0),
          0
        );
        const durationMs =
          Number.isFinite(result.data.durationMs) && result.data.durationMs >= 0
            ? result.data.durationMs
            : 0;

        await completeJob(job.id, {
          planId: plan.id,
          modulesCount,
          tasksCount,
          durationMs,
        });

        return {
          processed: true,
          jobId: job.id,
          status: 'completed',
        };
      }

      case 'retryable_failure': {
        const decision = shouldRetryJob({
          attemptNumber: job.attempts + 1,
          maxAttempts: job.maxAttempts,
          retryable: true,
        });
        logger.info(
          {
            jobId: job.id,
            classification: result.classification,
            retryDecision: decision.reason,
          },
          'Regeneration job retryable failure — retry decision applied'
        );
        await failJob(job.id, result.error.message, { retryable: true });
        return {
          processed: true,
          jobId: job.id,
          status: 'failed',
          reason: result.classification,
        };
      }

      case 'permanent_failure': {
        await failJob(job.id, result.error.message, { retryable: false });
        return {
          processed: true,
          jobId: job.id,
          status: 'failed',
          reason: result.classification,
        };
      }

      case 'already_finalized': {
        await completeJob(job.id, {
          planId: plan.id,
          modulesCount: 0,
          tasksCount: 0,
          durationMs: 0,
        });
        return {
          processed: true,
          jobId: job.id,
          status: 'completed',
        };
      }

      default:
        assertNever(result);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown regeneration worker error';

    logger.error(
      { jobId: job.id, error },
      'Failed while processing queued plan regeneration job'
    );

    try {
      await failJob(job.id, message, { retryable: false });
    } catch (secondaryError) {
      logger.error(
        { jobId: job.id, error: secondaryError },
        'Failed to persist failure state for queued plan regeneration job'
      );
    }

    return {
      processed: true,
      jobId: job.id,
      status: 'failed',
      reason: 'worker_exception',
    };
  }
}

type DrainRegenerationQueueResult = {
  processedCount: number;
  completedCount: number;
  failedCount: number;
};

type DrainRegenerationQueueOptions = {
  maxJobs?: number;
  processNextJob?: () => Promise<ProcessRegenerationJobResult>;
};

/** In-memory guard to prevent concurrent inline drains (thundering herd). */
let inlineDrainLockHeld = false;

/**
 * Tries to acquire the inline drain lock. Returns true if acquired, false if another drain is in progress.
 * Call {@link releaseInlineDrainLock} when the drain promise settles (success or failure).
 */
export function tryAcquireInlineDrainLock(): boolean {
  if (inlineDrainLockHeld) return false;
  inlineDrainLockHeld = true;
  return true;
}

/** Releases the inline drain lock. Must be called when drain finishes (e.g. in promise .finally). */
export function releaseInlineDrainLock(): void {
  inlineDrainLockHeld = false;
}

export async function drainRegenerationQueue(
  options?: DrainRegenerationQueueOptions
): Promise<DrainRegenerationQueueResult> {
  // Explicit maxJobs === 0 is a no-op: no jobs are processed.
  const maxJobs = Math.max(0, options?.maxJobs ?? 1);
  const processNextJob = options?.processNextJob ?? processNextRegenerationJob;

  let processedCount = 0;
  let completedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < maxJobs; i += 1) {
    const result = await processNextJob();

    if (!result.processed) {
      break;
    }

    processedCount += 1;
    if (result.status === 'completed') {
      completedCount += 1;
    }
    if (result.status === 'failed') {
      failedCount += 1;
    }
  }

  return {
    processedCount,
    completedCount,
    failedCount,
  };
}
