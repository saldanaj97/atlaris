import { ZodError } from 'zod';
import { runRegenerationQuotaReserved } from '@/features/billing/regeneration-quota-boundary';
import { resolveUserTier } from '@/features/billing/tier';
import { computeJobPriority, isPriorityTopic } from '@/features/jobs/priority';
import { enqueueJobWithResult } from '@/features/jobs/queue';
import {
  drainRegenerationQueue,
  registerInlineDrain,
  tryAcquireInlineDrainLock,
} from '@/features/jobs/regeneration-worker';
import { JOB_TYPES, type PlanRegenerationJobData } from '@/features/jobs/types';
import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import { planRegenerationRequestSchema } from '@/features/plans/validation/learningPlans';
import type { PlanRegenerationOverridesInput } from '@/features/plans/validation/learningPlans.types';
import { type PlainHandler, withAuthAndRateLimit } from '@/lib/api/auth';
import { AppError, RateLimitError, ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { json } from '@/lib/api/response';
import { regenerationQueueEnv } from '@/lib/config/env';
import { getActiveRegenerationJob } from '@/lib/db/queries/jobs';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';

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

      const body = await parseJsonBody(req, {
        mode: 'required',
        onMalformedJson: () =>
          new ValidationError('Invalid JSON in request body.'),
      });

      let overrides: PlanRegenerationOverridesInput | undefined;
      try {
        const parsed = planRegenerationRequestSchema.parse(body);
        overrides = parsed.overrides;
      } catch (err: unknown) {
        const errDetail = err instanceof Error ? err : new Error(String(err));
        const serializableCause = `${errDetail.name}: ${errDetail.message}`;
        if (err instanceof ZodError) {
          throw new ValidationError('Invalid overrides.', {
            cause: serializableCause,
            fieldErrors: err.flatten(),
          });
        }
        throw new ValidationError('Invalid overrides.', {
          cause: serializableCause,
        });
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

      const tier = await resolveUserTier(user.id, db);
      const priority = computeJobPriority({
        tier,
        isPriorityTopic: isPriorityTopic(overrides?.topic ?? plan.topic),
      });

      const payload: PlanRegenerationJobData = { planId, overrides };
      const boundaryResult = await runRegenerationQuotaReserved<{
        jobId: string;
        deduplicated: boolean;
      }>({
        userId: user.id,
        planId,
        dbClient: db,
        work: async () => {
          const enqueueResult = await enqueueJobWithResult(
            JOB_TYPES.PLAN_REGENERATION,
            planId,
            user.id,
            payload,
            priority
          );

          if (enqueueResult.deduplicated) {
            return {
              disposition: 'revert',
              reason: 'enqueue_deduplicated',
              jobId: enqueueResult.id,
              value: { jobId: enqueueResult.id, deduplicated: true },
            };
          }

          return {
            disposition: 'consumed',
            value: { jobId: enqueueResult.id, deduplicated: false },
          };
        },
      });

      if (!boundaryResult.ok) {
        throw new RateLimitError(
          'Regeneration quota exceeded for your subscription tier.',
          {
            remaining: Math.max(
              0,
              boundaryResult.limit - boundaryResult.currentCount
            ),
            limit: boundaryResult.limit,
          }
        );
      }

      if (!boundaryResult.consumed) {
        throw new AppError(
          'A regeneration job is already queued for this plan.',
          {
            status: 409,
            code: 'REGENERATION_ALREADY_QUEUED',
            details: {
              jobId: boundaryResult.value.jobId,
              ...(boundaryResult.reconciliationRequired && {
                reconciliationRequired: true,
              }),
            },
          }
        );
      }

      const acceptedJobId = boundaryResult.value.jobId;

      if (regenerationQueueEnv.inlineProcessingEnabled) {
        if (tryAcquireInlineDrainLock()) {
          const drainPromise = drainRegenerationQueue({ maxJobs: 1 }).catch(
            (error: unknown) => {
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
            }
          );
          registerInlineDrain(drainPromise);
        }
      }

      return json(
        {
          planId,
          jobId: acceptedJobId,
          status: 'pending',
        },
        { status: 202, headers: getPlanGenerationRateLimitHeaders(rateLimit) }
      );
    }
  )
);
