import { parsePersistedPdfContext } from '@/features/pdf/context';
import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import {
  type PlanGenerationHandlerOverrides,
  retryAndStreamPlanGenerationSession,
} from '@/features/plans/session/plan-generation-session';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { AppError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { getPlanAttemptsForUser } from '@/lib/db/queries/plans';
import { getDb } from '@/lib/db/runtime';

export const maxDuration = 60;

const RETRYABLE_STATUSES = new Set(['failed', 'pending_retry']);

/**
 * Creates the retry POST handler with optional dependency overrides.
 * Used by integration tests to supply mocks; production uses the default lifecycle service.
 */
export function createRetryHandler(deps?: {
  overrides?: PlanGenerationHandlerOverrides;
}): PlainHandler {
  return withErrorBoundary(
    withAuthAndRateLimit(
      'aiGeneration',
      async ({
        req,
        userId: authUserId,
        user: currentUser,
      }): Promise<Response> => {
        const planId = requirePlanIdFromRequest(req, 'second-to-last');
        // `authUserId` is the auth-provider subject used for RLS session setup;
        // `internalUserId` is the application user row used for ownership checks.
        const internalUserId = currentUser.id;

        const db = getDb();
        const rateLimit = await checkPlanGenerationRateLimit(
          internalUserId,
          db
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
          db
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
            }
          );
        }

        return await retryAndStreamPlanGenerationSession({
          req,
          authUserId,
          userId: internalUserId,
          planId,
          attemptNumber,
          requestDb: db,
          plan: {
            topic: plan.topic,
            skillLevel: plan.skillLevel,
            weeklyHours: plan.weeklyHours,
            learningStyle: plan.learningStyle,
            startDate: plan.startDate,
            deadlineDate: plan.deadlineDate,
            origin: plan.origin,
            pdfContext:
              plan.origin === 'pdf'
                ? parsePersistedPdfContext(plan.extractedContext)
                : null,
          },
          processGenerationAttempt: deps?.overrides?.processGenerationAttempt,
          headers: generationRateLimitHeaders,
        });
      }
    )
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
