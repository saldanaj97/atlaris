import {
  getPlanListTotalCount,
  listLightweightPlansForApi,
} from '@/features/plans/read-service';
import { type PlainHandler, withAuthAndRateLimit } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import {
  clampPageSize,
  getPaginationDefault,
  getPaginationMinimum,
  isValidPaginationValue,
  type PaginationField,
} from '@/shared/constants/pagination';

function parsePaginationParam(params: {
  rawValue: string | null;
  field: PaginationField;
}): number {
  if (params.rawValue === null) {
    return getPaginationDefault(params.field);
  }

  const parsed = Number(params.rawValue);

  if (!isValidPaginationValue(params.field, parsed)) {
    const minimum = getPaginationMinimum(params.field);
    throw new ValidationError(
      `${params.field} must be an integer greater than or equal to ${minimum}`,
      { [params.field]: params.rawValue }
    );
  }

  return params.field === 'limit' ? clampPageSize(parsed) : parsed;
}

export const GET: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, user }) => {
    const db = getDb();
    const url = new URL(req.url);

    const limit = parsePaginationParam({
      rawValue: url.searchParams.get('limit'),
      field: 'limit',
    });
    const offset = parsePaginationParam({
      rawValue: url.searchParams.get('offset'),
      field: 'offset',
    });

    logger.info(
      {
        source: 'plans-route',
        event: 'list_plans_started',
        userId: user.id,
        limit,
        offset,
      },
      'Listing lightweight plans'
    );

    const [summaries, totalCount] = await Promise.all([
      listLightweightPlansForApi({
        userId: user.id,
        dbClient: db,
        options: { limit, offset },
      }),
      getPlanListTotalCount({ userId: user.id, dbClient: db }),
    ]);

    logger.info(
      {
        source: 'plans-route',
        event: 'list_plans_succeeded',
        userId: user.id,
        limit,
        offset,
        totalCount,
        returnedCount: summaries.length,
      },
      'Listed lightweight plans'
    );

    return json(summaries, {
      headers: { 'X-Total-Count': String(totalCount) },
    });
  })
);
