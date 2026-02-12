import { z } from 'zod';

import { resolveModelForTier } from '@/lib/ai/model-resolver';
import { runGenerationAttempt, type ParsedModule } from '@/lib/ai/orchestrator';
import { learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { logger } from '@/lib/logging/logger';
import { parsePersistedPdfContext } from '@/lib/pdf/context';
import { resolveUserTier } from '@/lib/stripe/usage';
import { planRegenerationOverridesSchema } from '@/lib/validation/learningPlans';
import { eq } from 'drizzle-orm';

import { completeJob, failJob, getNextJob } from '@/lib/jobs/queue';
import { JOB_TYPES } from '@/lib/jobs/types';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const planRegenerationJobPayloadSchema = z
  .object({
    planId: z.string().uuid(),
    overrides: planRegenerationOverridesSchema.optional(),
  })
  .strict();

type PlanRegenerationJobPayload = z.infer<
  typeof planRegenerationJobPayloadSchema
>;

export interface ProcessRegenerationJobResult {
  processed: boolean;
  jobId?: string;
  status?: 'completed' | 'failed';
  reason?: string;
}

const toIsoDateString = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  return ISO_DATE_PATTERN.test(value) ? value : undefined;
};

const isRetryableClassification = (classification: string): boolean => {
  return (
    classification === 'timeout' ||
    classification === 'rate_limit' ||
    classification === 'provider_error'
  );
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
    pdfContext:
      plan.origin === 'pdf'
        ? parsePersistedPdfContext(plan.extractedContext)
        : null,
    skillLevel: overrides?.skillLevel ?? plan.skillLevel,
    weeklyHours: overrides?.weeklyHours ?? plan.weeklyHours,
    learningStyle: overrides?.learningStyle ?? plan.learningStyle,
    startDate: toIsoDateString(startDateValue),
    deadlineDate: toIsoDateString(deadlineDateValue),
  };
}

export async function processNextRegenerationJob(): Promise<ProcessRegenerationJobResult> {
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
    const { provider } = resolveModelForTier(userTier);
    const generationInput = buildGenerationInput(payload, plan);

    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId: plan.userId,
        input: generationInput,
      },
      { provider, dbClient: db }
    );

    if (result.status === 'success') {
      const modules: ParsedModule[] = result.modules;
      const modulesCount = modules.length;
      const tasksCount = modules.reduce(
        (total, module) => total + module.tasks.length,
        0
      );
      const durationMs =
        Number.isFinite(result.durationMs) && result.durationMs >= 0
          ? result.durationMs
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

    await failJob(job.id, result.error.message, {
      retryable: isRetryableClassification(result.classification),
    });

    return {
      processed: true,
      jobId: job.id,
      status: 'failed',
      reason: result.classification,
    };
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

export interface DrainRegenerationQueueResult {
  processedCount: number;
  completedCount: number;
  failedCount: number;
}

export interface DrainRegenerationQueueOptions {
  maxJobs?: number;
  processNextJob?: () => Promise<ProcessRegenerationJobResult>;
}

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
