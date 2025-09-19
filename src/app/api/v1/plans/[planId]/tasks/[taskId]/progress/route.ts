import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  modules,
  taskProgress,
  tasks,
} from '@/lib/db/schema';
import { getLearningPlanDetail, getUserByClerkId } from '@/lib/db/queries';
import {
  PROGRESS_STATUSES,
  type ProgressStatus,
} from '@/lib/types';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const progressStatusEnum = z.enum(
  PROGRESS_STATUSES as [ProgressStatus, ...ProgressStatus[]]
);

const bodySchema = z.object({
  status: progressStatusEnum,
});

function getParams(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const planIndex = segments.indexOf('plans');
  const tasksIndex = segments.indexOf('tasks');

  return {
    planId:
      planIndex !== -1 && segments.length > planIndex + 1
        ? segments[planIndex + 1]
        : undefined,
    taskId:
      tasksIndex !== -1 && segments.length > tasksIndex + 1
        ? segments[tasksIndex + 1]
        : undefined,
  };
}

export const POST = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const { planId, taskId } = getParams(req);

    if (!planId || !taskId) {
      throw new ValidationError('Plan id and task id are required in the path.');
    }

    let status: ProgressStatus;
    try {
      const payload = await req.json();
      ({ status } = bodySchema.parse(payload));
    } catch (error) {
      throw new ValidationError('Invalid request body.', error);
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const taskOwnership = await db
      .select({
        planId: learningPlans.id,
        taskId: tasks.id,
        moduleId: modules.id,
        planUserId: learningPlans.userId,
      })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .innerJoin(learningPlans, eq(modules.planId, learningPlans.id))
      .where(and(eq(tasks.id, taskId), eq(learningPlans.id, planId)))
      .limit(1);

    if (!taskOwnership.length || taskOwnership[0].planUserId !== user.id) {
      throw new NotFoundError('Task not found.');
    }

    const completedAt = status === 'completed' ? new Date() : null;
    const [progress] = await db
      .insert(taskProgress)
      .values({
        taskId,
        userId: user.id,
        status,
        completedAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [taskProgress.taskId, taskProgress.userId],
        set: { status, completedAt, updatedAt: new Date() },
      })
      .returning();

    const detail = await getLearningPlanDetail(planId, user.id);

    return json({
      taskProgress: progress,
      totals: detail
        ? {
            totalTasks: detail.totalTasks,
            completedTasks: detail.completedTasks,
          }
        : undefined,
    });
  })
);
