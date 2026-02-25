import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requirePlanIdFromRequest } from '@/lib/api/plans/route-context';
import { json } from '@/lib/api/response';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { logger } from '@/lib/logging/logger';
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
  withAuthAndRateLimit('read', async ({ req, user }) => {
    const planId = requirePlanIdFromRequest(req, 'last');

    logger.info({ planId, userId: user.id }, 'Fetching learning plan detail');

    let detail: Awaited<ReturnType<typeof getLearningPlanDetail>>;
    try {
      detail = await getLearningPlanDetail(planId, user.id);
    } catch (error) {
      logger.error(
        {
          planId,
          userId: user.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Failed fetching learning plan detail'
      );
      throw error;
    }

    if (!detail) {
      logger.error({ planId, userId: user.id }, 'Learning plan not found');
      throw new NotFoundError('Learning plan not found.');
    }

    const clientDetail = mapDetailToClient(detail);
    if (!clientDetail) {
      logger.error(
        { planId, userId: user.id },
        'Learning plan detail mapping returned null'
      );
      throw new NotFoundError('Learning plan not found.');
    }

    logger.debug({ planId, userId: user.id }, 'Fetched learning plan detail');

    return json(clientDetail);
  })
);

export const DELETE = withErrorBoundary(
  withAuthAndRateLimit('mutation', async () => {
    logger.error('Plan deletion attempted before implementation is available');
    throw new ValidationError('Plan deletion is not yet implemented.');
  })
);

// NOTE: PUT omitted by design (see comment above)
