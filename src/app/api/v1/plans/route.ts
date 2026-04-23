import {
	getPlanListTotalCount,
	listLightweightPlansForApi,
} from '@/features/plans/read-projection';
import { type PlainHandler, withAuthAndRateLimit } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseListPaginationParams } from '@/lib/api/pagination';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import {
	getPaginationDefault,
	PAGINATION_MAX_LIMIT,
} from '@/shared/constants/pagination';

export const GET: PlainHandler = withErrorBoundary(
	withAuthAndRateLimit('read', async ({ req, user }) => {
		const db = getDb();
		const url = new URL(req.url);

		const { limit, offset } = parseListPaginationParams(url.searchParams, {
			defaultLimit: getPaginationDefault('limit'),
			maxLimit: PAGINATION_MAX_LIMIT,
		});

		logger.info(
			{
				source: 'plans-route',
				event: 'list_plans_started',
				userId: user.id,
				limit,
				offset,
			},
			'Listing lightweight plans',
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
			'Listed lightweight plans',
		);

		return json(summaries, {
			headers: { 'X-Total-Count': String(totalCount) },
		});
	}),
);
