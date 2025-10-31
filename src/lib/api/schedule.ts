import { db } from '@/lib/db/drizzle';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
} from '@/lib/db/queries/schedules';
import { generateSchedule } from '@/lib/scheduling/generate';
import { computeInputsHash } from '@/lib/scheduling/hash';
import type { ScheduleInputs, ScheduleJson } from '@/lib/scheduling/types';

interface GetPlanScheduleParams {
  planId: string;
  userId: string;
}

/**
 * Retrieves or computes plan schedule with write-through caching
 */
export async function getPlanSchedule(
  params: GetPlanScheduleParams
): Promise<ScheduleJson> {
  const { planId, userId } = params;

  // Load plan
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId));

  if (!plan || plan.userId !== userId) {
    throw new Error('Plan not found or access denied');
  }

  // Load modules and tasks in a single joined query
  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order));

  const flatTasks: Array<typeof tasks.$inferSelect & { moduleTitle: string }> =
    planModules.length > 0
      ? await (async () => {
          const moduleIds = planModules.map((m) => m.id);
          const taskRows = await db
            .select({
              task: tasks,
              moduleTitle: modules.title,
            })
            .from(tasks)
            .innerJoin(modules, eq(tasks.moduleId, modules.id))
            .where(inArray(modules.id, moduleIds))
            .orderBy(asc(modules.order), asc(tasks.order));
          return taskRows.map((row) => ({
            ...row.task,
            moduleTitle: row.moduleTitle,
          }));
        })()
      : [];

  // Build schedule inputs
  const inputs: ScheduleInputs = {
    planId: plan.id,
    tasks: flatTasks.map((task, idx) => ({
      id: task.id,
      title: task.title,
      estimatedMinutes: task.estimatedMinutes,
      order: idx + 1,
      moduleId: task.moduleId,
      moduleTitle: task.moduleTitle,
    })),
    startDate: plan.startDate || plan.createdAt.toISOString().split('T')[0],
    deadline: plan.deadlineDate,
    weeklyHours: plan.weeklyHours,
    timezone: 'UTC', // TODO: Get from user preferences
  };

  // Compute hash
  const inputsHash = computeInputsHash(inputs);

  // Check cache
  const cached = await getPlanScheduleCache(planId);
  if (cached && cached.inputsHash === inputsHash) {
    return cached.scheduleJson;
  }

  // Generate new schedule
  const schedule = generateSchedule(inputs);

  // Write through cache
  await upsertPlanScheduleCache(planId, {
    scheduleJson: schedule,
    inputsHash,
    timezone: inputs.timezone,
    weeklyHours: inputs.weeklyHours,
    startDate: inputs.startDate,
    deadline: inputs.deadline,
  });

  return schedule;
}
