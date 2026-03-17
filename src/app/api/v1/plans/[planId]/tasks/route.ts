import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import { json } from '@/lib/api/response';
import { getAllTasksInPlan } from '@/lib/db/queries/tasks';
import { getDb } from '@/lib/db/runtime';

export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, user }) => {
    const planId = requirePlanIdFromRequest(req, 'second-to-last');
    const db = getDb();
    await requireOwnedPlanById({ planId, ownerUserId: user.id, dbClient: db });

    const tasks = await getAllTasksInPlan(user.id, planId, db);
    return json(tasks);
  })
);
