import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { getPlanGenerationAttemptsForRead } from '@/features/plans/read-service';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { NotFoundError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, user }) => {
    const planId = requirePlanIdFromRequest(req, 'second-to-last');

    const attempts = await getPlanGenerationAttemptsForRead({
      planId,
      userId: user.id,
    });
    if (!attempts) {
      throw new NotFoundError('Learning plan not found.');
    }

    return json(attempts);
  })
);
