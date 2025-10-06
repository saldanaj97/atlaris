import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError } from '@/lib/api/errors';
import { getAllTasksInPlan } from '@/lib/db/queries/tasks';
import { getUserByClerkId } from '@/lib/db/queries/users';

function getParams(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const planIndex = segments.indexOf('plans');

  return {
    planId:
      planIndex !== -1 && segments.length > planIndex + 1
        ? segments[planIndex + 1]
        : undefined,
  };
}

/**
 * GET /api/v1/plans/:planId/tasks
 * Retrieves all tasks in the specified learning plan for the authenticated user.
 * @param req - The incoming request object.
 * @param userId - The authenticated user's Clerk ID.
 * @returns A JSON response containing the list of tasks.
 */
export const GET = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const { planId } = getParams(req);
    if (!planId) {
      throw new NotFoundError('Plan ID is required in the path.');
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const tasks = await getAllTasksInPlan(user.id, planId);
    return new Response(JSON.stringify(tasks), { status: 200 });
  })
);
