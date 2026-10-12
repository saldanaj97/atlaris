import type { PlainHandler } from '@/lib/api/auth';

import {
  type CreatePlanRouteLogger,
  parseCreatePlanRequest,
} from '@/features/plans/api/create-plan-request';
import {
  createPlanGenerationSessionBoundary,
  type PlanGenerationSessionBoundary,
} from '@/features/plans/session/plan-generation-session';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';

const defaultBoundary: PlanGenerationSessionBoundary =
  createPlanGenerationSessionBoundary();

/**
 * Creates the stream POST handler with optional dependency overrides.
 *
 * Tests inject a fake `boundary` (typically built via
 * `createPlanGenerationSessionBoundary({ createLifecycleService })`) to swap
 * the lifecycle service under the boundary; production uses the default
 * boundary singleton.
 */
export function createStreamHandler(deps?: {
  boundary?: PlanGenerationSessionBoundary;
  logger?: CreatePlanRouteLogger;
}): PlainHandler {
  const routeLogger = deps?.logger ?? logger;
  const boundary = deps?.boundary ?? defaultBoundary;

  return requestBoundary.route(
    { rateLimit: 'aiGeneration' },
    async ({ req, actor, db, correlationId }) => {
      const authUserId = actor.authUserId;

      routeLogger.info(
        { authUserId, correlationId },
        'Plan stream handler entered',
      );

      const body = await parseCreatePlanRequest({
        req,
        authUserId,
        correlationId,
        logger: routeLogger,
        logPrefix: 'Plan stream',
        sentryRoute: 'plans-stream',
      });

      const internalUserId = actor.id;

      const rateLimit = await checkPlanGenerationRateLimit(internalUserId, db);
      const generationRateLimitHeaders =
        getPlanGenerationRateLimitHeaders(rateLimit);

      routeLogger.info(
        { authUserId, correlationId },
        'Delegating plan stream request to generation session',
      );

      return await boundary.respondCreateStream({
        req,
        authUserId,
        internalUserId,
        body,
        savedPreferredAiModel: actor.preferredAiModel ?? null,
        responseHeaders: generationRateLimitHeaders,
        requestId: correlationId,
      });
    },
  );
}

export const POST = createStreamHandler();
