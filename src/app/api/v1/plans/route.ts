import type { PlainHandler } from '@/lib/api/auth';

import { assertAiSpendAllowed } from '@/features/billing/ai-spend-guard';
import {
  type CreatePlanRouteLogger,
  parseCreatePlanRequest,
} from '@/features/plans/api/create-plan-request';
import { assertGenerationEntitled } from '@/features/plans/entitlement/errors';
import {
  getPlanListTotalCount,
  listLightweightPlansForApi,
} from '@/features/plans/read-projection/service';
import {
  createPlanGenerationSessionBoundary,
  type PlanGenerationSessionBoundary,
  type StartedPlanGeneration,
} from '@/features/plans/session/plan-generation-session';
import { parseListPaginationParams } from '@/lib/api/pagination';
import {
  checkPlanGenerationRateLimit,
  getPlanGenerationRateLimitHeaders,
} from '@/lib/api/rate-limit';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { getGroundedModelPreferences } from '@/lib/db/queries/user-preferences';
import { logger } from '@/lib/logging/logger';
import {
  getPaginationDefault,
  PAGINATION_MAX_LIMIT,
} from '@/shared/constants/pagination';

export const GET: PlainHandler = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ req, actor, db }) => {
    const { limit, offset } = parseListPaginationParams(
      new URL(req.url).searchParams,
      {
        defaultLimit: getPaginationDefault('limit'),
        maxLimit: PAGINATION_MAX_LIMIT,
      },
    );

    logger.info(
      {
        source: 'plans-route',
        event: 'list_plans_started',
        userId: actor.id,
        limit,
        offset,
      },
      'Listing lightweight plans',
    );

    const [summaries, totalCount] = await Promise.all([
      listLightweightPlansForApi({
        userId: actor.id,
        dbClient: db,
        options: { limit, offset },
      }),
      getPlanListTotalCount({ userId: actor.id, dbClient: db }),
    ]);

    logger.info(
      {
        source: 'plans-route',
        event: 'list_plans_succeeded',
        userId: actor.id,
        limit,
        offset,
        totalCount,
        returnedCount: summaries.length,
      },
      'Listed lightweight plans',
    );

    return json(summaries, {
      headers: { 'X-Total-Count': String(totalCount) },
    });
  },
);

const defaultBoundary: PlanGenerationSessionBoundary =
  createPlanGenerationSessionBoundary();

/**
 * Creates the create-plan POST handler with optional dependency overrides
 * (tests inject a `boundary` built with `createPlanGenerationSessionBoundary`).
 */
export function createPlanCreateHandler(deps?: {
  boundary?: PlanGenerationSessionBoundary;
  logger?: CreatePlanRouteLogger;
}): PlainHandler {
  const routeLogger = deps?.logger ?? logger;
  const boundary = deps?.boundary ?? defaultBoundary;

  return requestBoundary.route(
    { rateLimit: 'aiGeneration' },
    async ({ req, actor, db, correlationId }) => {
      assertGenerationEntitled(actor);
      const authUserId = actor.authUserId;

      const body = await parseCreatePlanRequest({
        req,
        authUserId,
        correlationId,
        logger: routeLogger,
        logPrefix: 'Plan create',
        sentryRoute: 'plans-create',
      });

      const rateLimit = await checkPlanGenerationRateLimit(actor.id, db);
      const generationRateLimitHeaders =
        getPlanGenerationRateLimitHeaders(rateLimit);
      await assertAiSpendAllowed(actor, db);

      const started = await boundary.startCreate({
        req,
        authUserId,
        internalUserId: actor.id,
        body,
        savedPreferredAiModel: actor.preferredAiModel ?? null,
        ...(actor.subscriptionTier === 'pro'
          ? {
              savedGroundedPicks: await getGroundedModelPreferences(
                actor.id,
                db,
              ),
            }
          : {}),
        requestId: correlationId,
      });

      routeLogger.info(
        { authUserId, correlationId, ...started },
        'Plan generation started',
      );

      return json<StartedPlanGeneration>(started, {
        status: 202,
        headers: generationRateLimitHeaders,
      });
    },
  );
}

export const POST = createPlanCreateHandler();
