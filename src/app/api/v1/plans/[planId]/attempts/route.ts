import { requireUuidRouteParam } from '@/features/plans/api/route-context';
import { getPlanGenerationAttemptsForRead } from '@/features/plans/read-projection/service';
import { NotFoundError } from '@/lib/api/errors';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';

export const GET = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ params, actor, db }) => {
    const planId = requireUuidRouteParam(params, 'planId');

    const attempts = await getPlanGenerationAttemptsForRead({
      planId,
      userId: actor.id,
      dbClient: db,
    });
    if (!attempts) {
      throw new NotFoundError('Learning plan not found.');
    }

    return json(attempts);
  },
);
