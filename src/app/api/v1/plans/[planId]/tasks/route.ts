import {
  requireOwnedPlanById,
  requirePlanIdFromRequest,
} from '@/features/plans/api/route-context';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { getAllTasksInPlan } from '@/lib/db/queries/tasks';

export const GET = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ req, actor, db }) => {
    const planId = requirePlanIdFromRequest(req, 'second-to-last');
    await requireOwnedPlanById({
      planId,
      ownerUserId: actor.id,
      dbClient: db,
    });

    const tasks = await getAllTasksInPlan(actor.id, planId, db);
    return json(tasks);
  },
);
