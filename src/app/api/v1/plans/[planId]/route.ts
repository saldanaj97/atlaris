import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { requirePlanIdFromRequest } from '@/lib/api/plans/route-context';
import { json } from '@/lib/api/response';
import { deletePlan, getLearningPlanDetail } from '@/lib/db/queries/plans';
import { logger } from '@/lib/logging/logger';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';

/**
 * GET /api/v1/plans/:planId
 *  - Returns the plan with ordered modules/tasks and user-specific progress for the authenticated user.
 *
 * DELETE /api/v1/plans/:planId
 *  - Permanently deletes the plan and all associated data (modules, tasks, progress, schedules, etc.).
 *  - Ownership enforced via RLS + explicit WHERE clause.
 *  - Blocks deletion of plans currently in 'generating' status.
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
  withAuthAndRateLimit('mutation', async ({ req, user }) => {
    const planId = requirePlanIdFromRequest(req, 'last');

    logger.info({ planId, userId: user.id }, 'Deleting learning plan');

    const result = await deletePlan(planId, user.id);

    if (!result.success) {
      if (result.reason === 'not_found') {
        throw new NotFoundError('Learning plan not found.');
      }
      throw new ConflictError(
        'Cannot delete a plan that is currently generating.'
      );
    }

    logger.info({ planId, userId: user.id }, 'Learning plan deleted');

    return json({ success: true }, { status: 200 });
  })
);

// NOTE: PUT omitted by design (see comment above)
