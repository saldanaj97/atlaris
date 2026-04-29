import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import {
  createPlanGenerationSessionBoundary,
  type PlanGenerationSessionBoundary,
} from '@/features/plans/session/plan-generation-session';
import type { PlainHandler } from '@/lib/api/auth';
import { AppError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { requestBoundary } from '@/lib/api/request-boundary';
import { getPlanAttemptsForUser } from '@/lib/db/queries/plans';

export const maxDuration = 60;

const RETRYABLE_STATUSES = new Set(['failed', 'pending_retry']);

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
function createRetryHandler(deps?: {
  boundary?: PlanGenerationSessionBoundary;
}): PlainHandler {
  const boundary = deps?.boundary ?? defaultBoundary;

  return withErrorBoundary(
    requestBoundary.route(
      { rateLimit: 'aiGeneration' },
      async ({ req, actor, db }): Promise<Response> => {
        const authUserId = actor.authUserId;
        const internalUserId = actor.id;
        const planId = requirePlanIdFromRequest(req, 'second-to-last');

        const rateLimit = await checkPlanGenerationRateLimit(
          internalUserId,
          db,
        );
        const generationRateLimitHeaders =
          getPlanGenerationRateLimitHeaders(rateLimit);

        const plan = await requireOwnedPlanById({
          planId,
          ownerUserId: internalUserId,
          dbClient: db,
        });
        const attemptsSnapshot = await getPlanAttemptsForUser(
          plan.id,
          internalUserId,
          db,
        );
        const attemptNumber = (attemptsSnapshot?.attempts.length ?? 0) + 1;

        // Pre-flight: reject non-retryable plan statuses with a clear HTTP error
        if (!RETRYABLE_STATUSES.has(plan.generationStatus ?? '')) {
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

        return await boundary.respondRetryStream({
          req,
          authUserId,
          internalUserId,
          planId,
          attemptNumber,
          plan: {
            topic: plan.topic,
            skillLevel: plan.skillLevel,
            weeklyHours: plan.weeklyHours,
            learningStyle: plan.learningStyle,
            startDate: plan.startDate,
            deadlineDate: plan.deadlineDate,
            origin: plan.origin,
          },
          tierDb: db,
          responseHeaders: generationRateLimitHeaders,
        });
      },
    ),
  );
}

/**
 * POST /api/v1/plans/:planId/retry
 *
 * Retries generation for a failed plan. Returns a streaming response.
 * Delegates to PlanLifecycleService for attempt management, generation,
 * failure marking, and usage recording. The route is a thin adapter that
 * handles HTTP-level validation (ownership, plan status) and SSE streaming.
 */
export const POST = createRetryHandler();
