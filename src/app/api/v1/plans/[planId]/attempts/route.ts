import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { getPlanIdFromUrl, isUuid } from '@/lib/api/route-helpers';
import { getPlanAttemptsForUser } from '@/lib/db/queries/plans';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { mapAttemptsToClient } from '@/lib/mappers/detailToClient';

export const GET = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const planId = getPlanIdFromUrl(req, 'second-to-last');
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }
    if (!isUuid(planId)) {
      throw new ValidationError('Invalid plan id format.');
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const result = await getPlanAttemptsForUser(planId, user.id);
    if (!result) {
      throw new NotFoundError('Learning plan not found.');
    }

    const attempts = mapAttemptsToClient(result.attempts);
    return json(attempts);
  })
);
