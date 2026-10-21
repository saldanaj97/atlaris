import type { PlainHandler } from '@/lib/api/auth';

import {
  requirePlanContentAccess,
  requireUuidRouteParam,
} from '@/features/plans/api/route-context';
import {
  createPlanGenerationSessionBoundary,
  PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
  type PlanGenerationSessionBoundary,
  type StartedPlanGeneration,
} from '@/features/plans/session/plan-generation-session';
import { AppError } from '@/lib/api/errors';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { getGroundedModelPreferences } from '@/lib/db/queries/user-preferences';

export const maxDuration = 60;

const RETRYABLE_PLAN_GENERATION_STATUSES: ReadonlySet<string> = new Set(
  PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
);

function isRetryableStatus(status: string | null): boolean {
  return status != null && RETRYABLE_PLAN_GENERATION_STATUSES.has(status);
}

const defaultBoundary: PlanGenerationSessionBoundary =
  createPlanGenerationSessionBoundary();

/**
 * Creates the retry POST handler with optional dependency overrides.
 *
 * Tests inject a fake `boundary` (typically built via
 * `createPlanGenerationSessionBoundary({ createLifecycleService })`) to swap
 * the lifecycle service under the boundary; production uses the default
 * boundary singleton.
 */
export function createRetryHandler(deps?: {
  boundary?: PlanGenerationSessionBoundary;
}): PlainHandler {
  const boundary = deps?.boundary ?? defaultBoundary;

  return requestBoundary.route(
    { rateLimit: 'aiGeneration' },
    async ({ req, params, actor, db, correlationId }): Promise<Response> => {
      const authUserId = actor.authUserId;
      const internalUserId = actor.id;
      const planId = requireUuidRouteParam(params, 'planId');

      const rateLimit = await checkPlanGenerationRateLimit(internalUserId, db);
      const generationRateLimitHeaders =
        getPlanGenerationRateLimitHeaders(rateLimit);

      const plan = await requirePlanContentAccess({
        planId,
        ownerUserId: internalUserId,
        dbClient: db,
      });

      if (!isRetryableStatus(plan.generationStatus)) {
        throw new AppError(
          "Plan is not eligible for retry. Only plans in 'failed' or 'pending_retry' may be retried.",
          {
            status: 400,
            code: 'VALIDATION_ERROR',
            classification: 'validation',
            headers: generationRateLimitHeaders,
          },
        );
      }

      const started = await boundary.startRetry({
        req,
        authUserId,
        internalUserId,
        planId,
        plan: {
          topic: plan.topic,
          skillLevel: plan.skillLevel,
          weeklyHours: plan.weeklyHours,
          learningStyle: plan.learningStyle,
          startDate: plan.startDate,
          deadlineDate: plan.deadlineDate,
        },
        savedPreferredAiModel: actor.preferredAiModel ?? null,
        // Only a Pro writer pick is ever honored, so skip the read below Pro.
        ...(actor.subscriptionTier === 'pro'
          ? {
              savedGroundedPicks: await getGroundedModelPreferences(
                actor.id,
                db,
              ),
            }
          : {}),
        tierDb: db,
        requestId: correlationId,
      });

      return json<StartedPlanGeneration>(started, {
        status: 202,
        headers: generationRateLimitHeaders,
      });
    },
  );
}

/**
 * POST /api/v1/plans/:planId/retry
 *
 * Retries generation for a failed plan: reserves the next attempt and starts
 * it on the jobs Worker. Returns `202 { planId, attemptId }`; the
 * plan page polls `GET /api/v1/plans/:planId/status` for the outcome. The
 * route is a thin adapter for HTTP-level validation (ownership, plan status).
 */
export const POST = createRetryHandler();
