import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  learningPlans,
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
} from '@/lib/db/schema';
import {
  mapLearningPlanDetail,
  mapPlanSummaries,
} from '@/lib/mappers/planQueries';
import {
  LearningPlan,
  LearningPlanDetail,
  Module,
  PlanSummary,
} from '@/lib/types/db';

export async function getUserLearningPlans(
  userId: string
): Promise<LearningPlan[]> {
  return await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));
}

export async function getLearningPlanWithModules(planId: string): Promise<
  Array<{
    learning_plans: LearningPlan | null;
    modules: Module | null;
  }>
> {
  return await db
    .select()
    .from(learningPlans)
    .leftJoin(modules, eq(modules.planId, learningPlans.id))
    .where(eq(learningPlans.id, planId));
}

export async function getPlanSummariesForUser(
  userId: string
): Promise<PlanSummary[]> {
  const planRows = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));

  if (!planRows.length) {
    // TODO - If adding pagination or filtering (e.g., by topic or status) ensure multiple
    // conditions are combined via a single where(and(...)) call instead of chaining.
    return [];
  }

  const planIds = planRows.map((plan) => plan.id);

  const moduleRows = await db
    .select()
    .from(modules)
    .where(inArray(modules.planId, planIds))
    .orderBy(asc(modules.order));

  const moduleIds = moduleRows.map((module) => module.id);

  const taskRows = moduleIds.length
    ? await db
        .select({
          id: tasks.id,
          moduleId: tasks.moduleId,
          planId: modules.planId,
          estimatedMinutes: tasks.estimatedMinutes,
        })
        .from(tasks)
        .innerJoin(modules, eq(tasks.moduleId, modules.id))
        .where(inArray(modules.planId, planIds))
    : [];

  const taskIds = taskRows.map((task) => task.id);

  const progressRows = taskIds.length
    ? await db
        .select({ taskId: taskProgress.taskId, status: taskProgress.status })
        .from(taskProgress)
        .where(
          and(
            eq(taskProgress.userId, userId),
            inArray(taskProgress.taskId, taskIds)
          )
        )
    : [];

  return mapPlanSummaries({
    planRows,
    moduleRows,
    taskRows,
    progressRows,
  });
}

export async function getLearningPlanDetail(
  planId: string,
  userId: string
): Promise<LearningPlanDetail | null> {
  const planRow = await db
    .select()
    .from(learningPlans)
    .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)))
    .limit(1);

  if (!planRow.length) {
    return null;
  }

  const plan = planRow[0];

  const moduleRows = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order));

  const moduleIds = moduleRows.map((module) => module.id);

  const taskRows = moduleIds.length
    ? await db
        .select()
        .from(tasks)
        .where(inArray(tasks.moduleId, moduleIds))
        .orderBy(asc(tasks.order))
    : [];

  const taskIds = taskRows.map((task) => task.id);

  const progressRows = taskIds.length
    ? await db
        .select()
        .from(taskProgress)
        .where(
          and(
            eq(taskProgress.userId, userId),
            inArray(taskProgress.taskId, taskIds)
          )
        )
    : [];

  const resourceRows = taskIds.length
    ? await db
        .select({
          id: taskResources.id,
          taskId: taskResources.taskId,
          resourceId: taskResources.resourceId,
          order: taskResources.order,
          notes: taskResources.notes,
          createdAt: taskResources.createdAt,
          resource: {
            id: resources.id,
            type: resources.type,
            title: resources.title,
            url: resources.url,
            domain: resources.domain,
            author: resources.author,
            durationMinutes: resources.durationMinutes,
            costCents: resources.costCents,
            currency: resources.currency,
            tags: resources.tags,
            createdAt: resources.createdAt,
          },
        })
        .from(taskResources)
        .innerJoin(resources, eq(taskResources.resourceId, resources.id))
        .where(inArray(taskResources.taskId, taskIds))
        .orderBy(asc(taskResources.order))
    : [];

  const [{ attemptCount = 0 } = { attemptCount: 0 }] = await db
    .select({ attemptCount: count(generationAttempts.id) })
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, planId));

  const attemptsCount = Number(attemptCount ?? 0);

  let latestAttempt = null;
  if (attemptsCount > 0) {
    const [attempt] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId))
      .orderBy(desc(generationAttempts.createdAt))
      .limit(1);

    latestAttempt = attempt ?? null;
  }

  return mapLearningPlanDetail({
    plan,
    moduleRows,
    taskRows,
    progressRows,
    resourceRows: resourceRows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      resourceId: r.resourceId,
      order: r.order,
      notes: r.notes,
      createdAt: r.createdAt,
      resource: r.resource,
    })),
    latestAttempt,
    attemptsCount,
  });
}

export async function getPlanAttemptsForUser(planId: string, userId: string) {
  const planRow = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)))
    .limit(1);

  if (!planRow.length) {
    return null;
  }

  const attempts = await db
    .select()
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, planId))
    .orderBy(desc(generationAttempts.createdAt));

  return { plan: planRow[0], attempts };
}

/**
 * Batch fetch modules with their tasks for multiple plans.
 * Prevents N+1 queries when displaying multiple plans.
 * @param userId - User ID requesting the data, used to enforce plan ownership
 * @param planIds - Array of plan IDs to fetch modules and tasks for
 * @returns Array of modules with their nested tasks
 */
export async function getModulesWithTasksByPlanIds(
  userId: string,
  planIds: string[]
): Promise<
  Array<{
    id: string;
    planId: string;
    order: number;
    title: string;
    description: string | null;
    estimatedMinutes: number;
    createdAt: Date;
    updatedAt: Date;
    tasks: Array<{
      id: string;
      moduleId: string;
      order: number;
      title: string;
      description: string | null;
      estimatedMinutes: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }>
> {
  if (!planIds.length) {
    return [];
  }

  const accessiblePlans = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.userId, userId),
        inArray(learningPlans.id, planIds)
      )
    );

  if (!accessiblePlans.length) {
    return [];
  }

  const accessiblePlanIds = accessiblePlans.map((plan) => plan.id);

  // Fetch all modules for all plans in a single query
  const moduleRows = await db
    .select()
    .from(modules)
    .where(inArray(modules.planId, accessiblePlanIds))
    .orderBy(asc(modules.order));

  if (!moduleRows.length) {
    return [];
  }

  const moduleIds = moduleRows.map((module) => module.id);

  // Fetch all tasks for all modules in a single query
  const taskRows = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.moduleId, moduleIds))
    .orderBy(asc(tasks.order));

  // Group tasks by moduleId
  const tasksByModuleId = taskRows.reduce(
    (acc, task) => {
      if (!acc[task.moduleId]) {
        acc[task.moduleId] = [];
      }
      acc[task.moduleId].push(task);
      return acc;
    },
    {} as Record<string, typeof taskRows>
  );

  // Return modules with nested tasks
  return moduleRows.map((module) => ({
    ...module,
    tasks: tasksByModuleId[module.id] ?? [],
  }));
}

/**
 * Batch fetch progress aggregated by plan ID for multiple plans.
 * Prevents N+1 queries when displaying plan lists with progress.
 * @param userId - User ID to fetch progress for (only their plans are returned)
 * @param planIds - Array of plan IDs to fetch progress for
 * @returns Object mapping plan ID to progress stats (completed count and total count)
 */
export async function getProgressByPlanIds(
  userId: string,
  planIds: string[]
): Promise<Record<string, { completed: number; total: number }>> {
  if (!planIds.length) {
    return {};
  }

  const accessiblePlans = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.userId, userId),
        inArray(learningPlans.id, planIds)
      )
    );

  const accessiblePlanIds = accessiblePlans.map((plan) => plan.id);

  if (!accessiblePlanIds.length) {
    return {};
  }

  // Fetch all modules for these plans
  const moduleRows = await db
    .select({ id: modules.id, planId: modules.planId })
    .from(modules)
    .where(inArray(modules.planId, accessiblePlanIds));

  if (!moduleRows.length) {
    return accessiblePlanIds.reduce(
      (acc, planId) => {
        acc[planId] = { completed: 0, total: 0 };
        return acc;
      },
      {} as Record<string, { completed: number; total: number }>
    );
  }

  const moduleIds = moduleRows.map((module) => module.id);

  // Fetch all tasks for these modules
  const taskRows = await db
    .select({ id: tasks.id, moduleId: tasks.moduleId })
    .from(tasks)
    .where(inArray(tasks.moduleId, moduleIds));

  if (!taskRows.length) {
    return accessiblePlanIds.reduce(
      (acc, planId) => {
        acc[planId] = { completed: 0, total: 0 };
        return acc;
      },
      {} as Record<string, { completed: number; total: number }>
    );
  }

  const taskIds = taskRows.map((task) => task.id);

  // Fetch all progress records for these tasks and this user
  const progressRows = await db
    .select({ taskId: taskProgress.taskId, status: taskProgress.status })
    .from(taskProgress)
    .where(
      and(
        eq(taskProgress.userId, userId),
        inArray(taskProgress.taskId, taskIds)
      )
    );

  // Build lookup maps: taskId → moduleId → planId
  const taskToModuleMap = new Map(
    taskRows.map((task) => [task.id, task.moduleId])
  );
  const moduleToPlanMap = new Map(
    moduleRows.map((module) => [module.id, module.planId])
  );

  // Initialize progress object with all plan IDs
  const progressByPlanId: Record<string, { completed: number; total: number }> =
    {};
  for (const planId of accessiblePlanIds) {
    progressByPlanId[planId] = { completed: 0, total: 0 };
  }

  // Count total tasks per plan
  for (const task of taskRows) {
    const moduleId = task.moduleId;
    const planId = moduleToPlanMap.get(moduleId);
    if (planId) {
      const planProgress = progressByPlanId[planId];
      if (planProgress) {
        planProgress.total += 1;
      }
    }
  }

  // Count completed tasks per plan
  for (const progress of progressRows) {
    if (progress.status === 'completed') {
      const moduleId = taskToModuleMap.get(progress.taskId);
      if (moduleId) {
        const planId = moduleToPlanMap.get(moduleId);
        if (planId) {
          const planProgress = progressByPlanId[planId];
          if (planProgress) {
            planProgress.completed += 1;
          }
        }
      }
    }
  }

  return progressByPlanId;
}
