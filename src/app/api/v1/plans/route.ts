import {
  getPlanListTotalCount,
  listLightweightPlansForApi,
} from '@/features/plans/read-projection/service';
import type { PlainHandler } from '@/lib/api/auth';
import { parseListPaginationParams } from '@/lib/api/pagination';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import {
  getPaginationDefault,
  PAGINATION_MAX_LIMIT,
} from '@/shared/constants/pagination';

export const GET: PlainHandler = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ req, actor, db }) => {
    const url = new URL(req.url);

    const { limit, offset } = parseListPaginationParams(url.searchParams, {
      defaultLimit: getPaginationDefault('limit'),
      maxLimit: PAGINATION_MAX_LIMIT,
    });

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
