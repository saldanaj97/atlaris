import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { getLearningPlanDetail, getUserByClerkId } from '@/lib/db/queries';

/**
 * GET /api/v1/plans/:planId
 *  - Returns the plan with ordered modules/tasks and user-specific progress for the authenticated user.
 *
 * DELETE /api/v1/plans/:planId
 *  - Hard deletion deferred until product requirements are finalised.
 *
 * PUT intentionally deferred (no direct user edits in MVP; regeneration flow supersedes manual editing).
 */

function getPlanId(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1];
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

    const detail = await getLearningPlanDetail(planId, user.id);
    if (!detail) {
      throw new NotFoundError('Learning plan not found.');
    }

    return json(detail);
  })
);

export const DELETE = withErrorBoundary(
  withAuth(async () => {
    throw new ValidationError('Plan deletion is not yet implemented.');
  })
);

// NOTE: PUT omitted by design (see comment above)
