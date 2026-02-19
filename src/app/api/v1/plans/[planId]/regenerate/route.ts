import { ZodError } from 'zod';

import {
  withAuthAndRateLimit,
  withErrorBoundary,
  type PlainHandler,
} from '@/lib/api/auth';
import { AppError, RateLimitError, ValidationError } from '@/lib/api/errors';
import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/lib/api/plans/route-context';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { json } from '@/lib/api/response';
import { regenerationQueueEnv } from '@/lib/config/env';
import { getActiveRegenerationJob } from '@/lib/db/queries/jobs';
import { getDb } from '@/lib/db/runtime';
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

/**
 * POST /api/v1/plans/:planId/regenerate
 * Enqueues a regeneration job for an existing plan with optional parameter overrides.
 */
export const POST: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit(
    'aiGeneration',
    async ({ req, user, params: _params }) => {
      if (!regenerationQueueEnv.enabled) {
        throw new AppError(
          'Plan regeneration is temporarily disabled while queue workers are unavailable.',
          {
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
          }
        );
      }

      const planId = requirePlanIdFromRequest(req, 'second-to-last');
      const db = getDb();
      const plan = await requireOwnedPlanById({
        planId,
        ownerUserId: user.id,
        dbClient: db,
      });

      // Parse request body for overrides (before quota check to fail fast on validation)
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new ValidationError('Invalid JSON in request body.');
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

      const rateLimit = await checkPlanGenerationRateLimit(user.id, db);

      // Atomically check and increment regeneration quota (prevents TOCTOU race)
      const usageResult = await atomicCheckAndIncrementUsage(
        user.id,
        'regeneration',
        db
      );
      if (!usageResult.allowed) {
        throw new RateLimitError(
          'Regeneration quota exceeded for your subscription tier.',
          {
            remaining: rateLimit.remaining,
            limit: rateLimit.limit,
            reset: rateLimit.reset,
          }
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
          void drainRegenerationQueue({ maxJobs: 1 })
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
        }
      }

      // generationId is an alias for planId kept for backwards compatibility with existing clients.
      return json(
        {
          generationId: planId,
          planId,
          jobId: enqueueResult.id,
          status: 'pending',
        },
        { status: 202, headers: getPlanGenerationRateLimitHeaders(rateLimit) }
      );
    }
  )
);
