import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { toClientGenerationAttempts } from '@/features/plans/read-models/detail';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { NotFoundError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { getPlanAttemptsForUser } from '@/lib/db/queries/plans';

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, user }) => {
    const planId = requirePlanIdFromRequest(req, 'second-to-last');

    const result = await getPlanAttemptsForUser(planId, user.id);
    if (!result) {
      throw new NotFoundError('Learning plan not found.');
    }

    const attempts = toClientGenerationAttempts(result.attempts);
    return json(attempts);
  })
);
