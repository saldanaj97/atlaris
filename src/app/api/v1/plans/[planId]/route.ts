import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { getPlanDetailForRead } from '@/features/plans/read-service';
import { removePlanForWrite } from '@/features/plans/write-service';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { NotFoundError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
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
    const dbClient = getDb();

    logger.info({ planId, userId: user.id }, 'Fetching learning plan detail');

    const detail = await getPlanDetailForRead({
      planId,
      userId: user.id,
      dbClient,
    });

    if (!detail) {
      throw new NotFoundError('Learning plan not found.', undefined, {
        planId,
        userId: user.id,
      });
    }

    logger.debug({ planId, userId: user.id }, 'Fetched learning plan detail');

    return json(detail);
  })
);

export const DELETE = withErrorBoundary(
  withAuthAndRateLimit('mutation', async ({ req, user }) => {
    const planId = requirePlanIdFromRequest(req, 'last');
    const dbClient = getDb();

    logger.info({ planId, userId: user.id }, 'Deleting learning plan');

    await removePlanForWrite({ planId, userId: user.id, dbClient });

    logger.info({ planId, userId: user.id }, 'Learning plan deleted');

    return json({ success: true });
  })
);
