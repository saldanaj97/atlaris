import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { getPlanGenerationAttemptsForRead } from '@/features/plans/read-projection/service';
import { NotFoundError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';

export const GET = withErrorBoundary(
  requestBoundary.route({ rateLimit: 'read' }, async ({ req, actor }) => {
    const planId = requirePlanIdFromRequest(req, 'second-to-last');

    const attempts = await getPlanGenerationAttemptsForRead({
      planId,
      userId: actor.id,
    });
    if (!attempts) {
      throw new NotFoundError('Learning plan not found.');
    }

    return json(attempts);
  }),
);
