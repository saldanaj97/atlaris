import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { getPlanDetailForRead } from '@/features/plans/read-projection/service';
import { removePlanForWrite } from '@/features/plans/write-service';
import { NotFoundError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
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
  requestBoundary.route({ rateLimit: 'read' }, async ({ req, actor, db }) => {
    const planId = requirePlanIdFromRequest(req, 'last');

    logger.info({ planId, userId: actor.id }, 'Fetching learning plan detail');

    const detail = await getPlanDetailForRead({
      planId,
      userId: actor.id,
      dbClient: db,
    });

    if (!detail) {
      throw new NotFoundError('Learning plan not found.', undefined, {
        planId,
        userId: actor.id,
      });
    }

    logger.debug({ planId, userId: actor.id }, 'Fetched learning plan detail');

    return json(detail);
  }),
);

export const DELETE = withErrorBoundary(
  requestBoundary.route(
    { rateLimit: 'mutation' },
    async ({ req, actor, db }) => {
      const planId = requirePlanIdFromRequest(req, 'last');

      logger.info({ planId, userId: actor.id }, 'Deleting learning plan');

      await removePlanForWrite({ planId, userId: actor.id, dbClient: db });

      logger.info({ planId, userId: actor.id }, 'Learning plan deleted');

      return json({ success: true });
    },
  ),
);
