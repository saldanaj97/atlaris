import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { toClientPlanDetail } from '@/features/plans/read-models/detail';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { deletePlan, getLearningPlanDetail } from '@/lib/db/queries/plans';
import { logger } from '@/lib/logging/logger';

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

    const detail = await getLearningPlanDetail(planId, user.id);

    if (!detail) {
      throw new NotFoundError('Learning plan not found.', undefined, {
        planId,
        userId: user.id,
      });
    }

    const clientDetail = toClientPlanDetail(detail);
    if (!clientDetail) {
      throw new NotFoundError('Learning plan not found.', undefined, {
        planId,
        userId: user.id,
      });
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
      if (result.reason === 'currently_generating') {
        throw new ConflictError(
          'Cannot delete a plan that is currently generating.'
        );
      }
      throw new ConflictError(
        'Cannot delete learning plan in its current state.'
      );
    }

    logger.info({ planId, userId: user.id }, 'Learning plan deleted');

    return json({ success: true });
  })
);
