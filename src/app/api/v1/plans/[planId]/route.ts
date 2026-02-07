import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { getPlanIdFromUrl, isUuid } from '@/lib/api/route-helpers';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';

/**
 * GET /api/v1/plans/:planId
 *  - Returns the plan with ordered modules/tasks and user-specific progress for the authenticated user.
 *
 * DELETE /api/v1/plans/:planId
 *  - Hard deletion deferred until product requirements are finalised.
 *
 * PUT intentionally deferred (no direct user edits in MVP; regeneration flow supersedes manual editing).
 */

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, userId }) => {
    const planId = getPlanIdFromUrl(req, 'last');
    if (!planId) {
      throw new ValidationError('Plan id is required in the request path.');
    }
    if (!isUuid(planId)) {
      throw new ValidationError('Invalid plan id format.');
    }

    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const detail = await getLearningPlanDetail(planId, user.id);
    if (!detail) {
      throw new NotFoundError('Learning plan not found.');
    }

    const clientDetail = mapDetailToClient(detail);
    if (!clientDetail) {
      throw new NotFoundError('Learning plan not found.');
    }

    return json(clientDetail);
  })
);

export const DELETE = withErrorBoundary(
  withAuthAndRateLimit('mutation', async () => {
    throw new ValidationError('Plan deletion is not yet implemented.');
  })
);

// NOTE: PUT omitted by design (see comment above)
