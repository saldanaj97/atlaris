import { eq } from 'drizzle-orm';
import type { Job } from '@/features/jobs/types';
import { JOB_TYPES } from '@/features/jobs/types';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle';
import { learningPlans } from '@/lib/db/schema';
import { db as serviceRoleDb } from '@/lib/db/service-role';
import { assertNever } from '@/lib/errors';
import {
  createDefaultRegenerationOrchestrationDeps,
  type RegenerationOrchestrationDeps,
} from './deps';
import {
  type PlanRegenerationJobPayload,
  planRegenerationJobPayloadSchema,
} from './schema';
import type { ProcessPlanRegenerationJobResult } from './types';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_JOB_PAYLOAD_MESSAGE = 'Invalid plan regeneration job payload.';
const PLAN_NOT_FOUND_MESSAGE = 'Plan not found for queued regeneration.';
const UNSAFE_WORKER_FAILURE_MESSAGE = 'Queued plan regeneration failed.';

const toIsoDateString = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (!ISO_DATE_PATTERN.test(value)) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  // Reject non-calendar dates (e.g. 2023-02-30) that JS normalizes.
  return parsed.toISOString().startsWith(value) ? value : undefined;
};

const resolveRegenerationNotes = (
  overrides: PlanRegenerationJobPayload['overrides'],
) => {
  if (!overrides || overrides.notes === undefined) {
    return undefined;
  }

  return overrides.notes;
};

function buildSanitizedGenerationFailureMessage(
  classification: string,
): string {
  return `Plan regeneration failed (${classification}).`;
}

function buildGenerationInput(
  payload: PlanRegenerationJobPayload,
  plan: typeof learningPlans.$inferSelect,
) {
  const overrides = payload.overrides;

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
    const parsed = planRegenerationJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      await d.queue.failJob(job.id, INVALID_JOB_PAYLOAD_MESSAGE, {
        retryable: false,
      });
      return { kind: 'invalid-payload', jobId: job.id };
    }

    payload = parsed.data;

    if (job.planId !== payload.planId) {
      d.logger.error(
        {
          jobId: job.id,
          jobPlanId: job.planId,
          payloadPlanId: payload.planId,
        },
        'Queued plan regeneration job metadata mismatch',
      );
      await d.queue.failJob(job.id, INVALID_JOB_PAYLOAD_MESSAGE, {
        retryable: false,
      });
      return { kind: 'invalid-payload', jobId: job.id };
    }

    const plan = await d.dbClient.query.learningPlans.findFirst({
      where: eq(learningPlans.id, payload.planId),
    });

    if (!plan || plan.userId !== job.userId) {
      await d.queue.failJob(job.id, PLAN_NOT_FOUND_MESSAGE, {
        retryable: false,
      });
      return {
        kind: 'plan-not-found-or-unauthorized',
        jobId: job.id,
        planId: payload.planId,
      };
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

    switch (result.status) {
      case 'generation_success': {
        const modules = result.data.modules;
        const modulesCount = modules.length;
        const tasksCount = modules.reduce(
          (total, m) => total + (m.tasks?.length ?? 0),
          0,
        );
        const durationMs =
          Number.isFinite(result.data.durationMs) && result.data.durationMs >= 0
            ? result.data.durationMs
            : 0;

        await d.queue.completeJob(job.id, {
          planId: plan.id,
          modulesCount,
          tasksCount,
          durationMs,
        });

        return {
          kind: 'completed',
          jobId: job.id,
          planId: plan.id,
        };
      }

      case 'retryable_failure': {
        const decision = d.retry.shouldRetryJob({
          attemptNumber: job.attempts + 1,
          maxAttempts: job.maxAttempts,
          retryable: true,
        });
        d.logger.info(
          {
            jobId: job.id,
            classification: result.classification,
            retryDecision: decision.reason,
            error: result.error,
          },
          'Regeneration job retryable failure — retry decision applied',
        );
        await d.queue.failJob(
          job.id,
          buildSanitizedGenerationFailureMessage(result.classification),
          {
            retryable: decision.shouldRetry,
          },
        );
        return {
          kind: 'retryable-failure',
          jobId: job.id,
          planId: plan.id,
          willRetry: decision.shouldRetry,
        };
      }

      case 'permanent_failure': {
        d.logger.error(
          {
            jobId: job.id,
            classification: result.classification,
            error: result.error,
          },
          'Regeneration job permanent failure',
        );
        await d.queue.failJob(
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

      case 'already_finalized': {
        d.logger.info(
          { jobId: job.id, planId: plan.id },
          'Regeneration job: plan already finalized — completing queue job idempotently',
        );
        await d.queue.completeJob(job.id, {
          planId: plan.id,
          modulesCount: 0,
          tasksCount: 0,
          durationMs: 0,
        });
        d.logger.info(
          { jobId: job.id, planId: plan.id },
          'Regeneration job: queue job completed after already_finalized lifecycle outcome',
        );
        return {
          kind: 'already-finalized',
          jobId: job.id,
          planId: plan.id,
        };
      }

      default:
        assertNever(result);
    }
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
