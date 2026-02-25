import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError } from '@/lib/api/errors';
import { requirePlanIdFromRequest } from '@/lib/api/plans/route-context';
import { json } from '@/lib/api/response';
import { getPlanAttemptsForUser } from '@/lib/db/queries/plans';
import { mapAttemptsToClient } from '@/lib/mappers/detailToClient';

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, user }) => {
    const planId = requirePlanIdFromRequest(req, 'second-to-last');

    const result = await getPlanAttemptsForUser(planId, user.id);
    if (!result) {
      throw new NotFoundError('Learning plan not found.');
    }

    const attempts = mapAttemptsToClient(result.attempts);
    return json(attempts);
  })
);
