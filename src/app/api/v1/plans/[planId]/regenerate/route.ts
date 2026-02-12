import { ZodError } from 'zod';

import {
  withAuthAndRateLimit,
  withErrorBoundary,
  type PlainHandler,
} from '@/lib/api/auth';
import { AppError, ValidationError } from '@/lib/api/errors';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { json, jsonError } from '@/lib/api/response';
import { isUuid } from '@/lib/api/route-helpers';
import { regenerationQueueEnv } from '@/lib/config/env';
import { getActiveRegenerationJob } from '@/lib/db/queries/jobs';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { learningPlans } from '@/lib/db/schema';
import { enqueueJobWithResult } from '@/lib/jobs/queue';
import {
  drainRegenerationQueue,
  releaseInlineDrainLock,
  tryAcquireInlineDrainLock,
} from '@/lib/jobs/regeneration-worker';
import {
  JOB_TYPES,
  type JobType,
  type PlanRegenerationJobData,
} from '@/lib/jobs/types';
import { logger } from '@/lib/logging/logger';
import { recordBillingReconciliationRequired } from '@/lib/metrics/ops';
import { computeJobPriority, isPriorityTopic } from '@/lib/queue/priority';
import {
  atomicCheckAndIncrementUsage,
  decrementRegenerationUsage,
  resolveUserTier,
} from '@/lib/stripe/usage';
import {
  planRegenerationRequestSchema,
  type PlanRegenerationOverridesInput,
} from '@/lib/validation/learningPlans';
import { eq } from 'drizzle-orm';

/**
 * POST /api/v1/plans/:planId/regenerate
 * Enqueues a regeneration job for an existing plan with optional parameter overrides.
 */
export const POST: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('aiGeneration', async ({ req, userId, params }) => {
    if (!regenerationQueueEnv.enabled) {
      return jsonError(
        'Plan regeneration is temporarily disabled while queue workers are unavailable.',
        {
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
        }
      );
    }

    const planId = params.planId;
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }
    if (!isUuid(planId)) {
      throw new ValidationError('Invalid plan id format.');
    }

    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    // Fetch and verify plan ownership (RLS-enforced via getDb)
    const db = getDb();
    const plan = await db.query.learningPlans.findFirst({
      where: eq(learningPlans.id, planId),
    });

    if (!plan || plan.userId !== user.id) {
      return jsonError('Plan not found', { status: 404 });
    }

    // Parse request body for overrides (before quota check to fail fast on validation)
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid JSON in request body.', {
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    let overrides: PlanRegenerationOverridesInput | undefined;
    try {
      const parsed = planRegenerationRequestSchema.parse(body);
      overrides = parsed.overrides;
    } catch (err: unknown) {
      const errDetail = err instanceof Error ? err : new Error(String(err));
      if (err instanceof ZodError) {
        throw new ValidationError('Invalid overrides.', {
          cause: errDetail,
          fieldErrors: err.flatten(),
        });
      }
      throw new ValidationError('Invalid overrides.', { cause: errDetail });
    }

    const existingActiveJob = await getActiveRegenerationJob(
      planId,
      user.id,
      db
    );
    if (existingActiveJob) {
      throw new AppError(
        'A regeneration job is already queued for this plan.',
        {
          status: 409,
          code: 'REGENERATION_ALREADY_QUEUED',
          details: { jobId: existingActiveJob.id },
        }
      );
    }

    const { remaining } = await checkPlanGenerationRateLimit(user.id, db);
    const generationRateLimitHeaders =
      getPlanGenerationRateLimitHeaders(remaining);

    // Atomically check and increment regeneration quota (prevents TOCTOU race)
    const usageResult = await atomicCheckAndIncrementUsage(
      user.id,
      'regeneration',
      db
    );
    if (!usageResult.allowed) {
      return jsonError(
        'Regeneration quota exceeded for your subscription tier.',
        { status: 429, headers: generationRateLimitHeaders }
      );
    }

    // Compute priority based on tier and topic
    const tier = await resolveUserTier(user.id, db);
    const priority = computeJobPriority({
      tier,
      isPriorityTopic: isPriorityTopic(overrides?.topic ?? plan.topic),
    });

    // Enqueue regeneration job
    const payload: PlanRegenerationJobData = { planId, overrides };
    const enqueueResult = await enqueueJobWithResult(
      JOB_TYPES.PLAN_REGENERATION as JobType,
      planId,
      user.id,
      payload,
      priority
    );

    if (enqueueResult.deduplicated) {
      let rollbackFailed = false;
      try {
        await decrementRegenerationUsage(user.id, db);
      } catch (rollbackError) {
        rollbackFailed = true;
        recordBillingReconciliationRequired(
          {
            planId,
            userId: user.id,
            jobId: enqueueResult.id,
          },
          rollbackError
        );
        logger.error(
          {
            planId,
            userId: user.id,
            jobId: enqueueResult.id,
            rollbackError,
          },
          'Failed to rollback regeneration usage after deduplicated enqueue'
        );
      }

      throw new AppError(
        'A regeneration job is already queued for this plan.',
        {
          status: 409,
          code: 'REGENERATION_ALREADY_QUEUED',
          details: {
            jobId: enqueueResult.id,
            ...(rollbackFailed && { reconciliationRequired: true }),
          },
        }
      );
    }

    if (regenerationQueueEnv.inlineProcessingEnabled) {
      if (tryAcquireInlineDrainLock()) {
        try {
          const drainPromise = drainRegenerationQueue({ maxJobs: 1 });
          void drainPromise
            .catch((error: unknown) => {
              logger.error(
                {
                  planId,
                  userId: user.id,
                  error,
                  inlineProcessingEnabled:
                    regenerationQueueEnv.inlineProcessingEnabled,
                  drainFn: 'drainRegenerationQueue',
                },
                'Inline regeneration queue drain failed'
              );
            })
            .finally(releaseInlineDrainLock);
        } catch (syncError: unknown) {
          releaseInlineDrainLock();
          logger.error(
            {
              planId,
              userId: user.id,
              error: syncError,
              inlineProcessingEnabled:
                regenerationQueueEnv.inlineProcessingEnabled,
              drainFn: 'drainRegenerationQueue',
            },
            'Inline regeneration queue drain failed (sync throw)'
          );
        }
      }
    }

    return json(
      {
        generationId: planId,
        planId,
        jobId: enqueueResult.id,
        status: 'pending',
      },
      { status: 202, headers: generationRateLimitHeaders }
    );
  })
);
