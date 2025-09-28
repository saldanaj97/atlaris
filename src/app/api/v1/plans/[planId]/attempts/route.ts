import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { getPlanAttemptsForUser, getUserByClerkId } from '@/lib/db/queries';
import { mapAttemptsToClient } from '@/lib/mappers/detailToClient';

function getPlanId(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 2];
}

export const GET = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const planId = getPlanId(req);
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const result = await getPlanAttemptsForUser(planId, user.id);
    if (!result) {
      throw new NotFoundError('Learning plan not found.');
    }

    const attempts = mapAttemptsToClient(result.attempts);
    return json(attempts);
  })
);
