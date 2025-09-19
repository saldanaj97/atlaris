import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  LearningPlanDetail,
  ModuleWithRelations,
  PlanSummary,
  TaskResourceWithResource,
} from '@/lib/types';

import { db } from './drizzle';
import {
  learningPlans,
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
  users,
} from './schema';

// User queries
export async function getUserByClerkId(clerkUserId: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  return result[0];
}

export async function createUser(userData: {
  clerkUserId: string;
  email: string;
  name?: string;
}) {
  const result = await db.insert(users).values(userData).returning();
  return result[0];
}

// Learning plan queries
export async function getUserLearningPlans(userId: string) {
  return await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));
}

export async function getLearningPlanWithModules(planId: string) {
  return await db
    .select()
    .from(learningPlans)
    .leftJoin(modules, eq(modules.planId, learningPlans.id))
    .where(eq(learningPlans.id, planId));
}

// Task queries
export async function getTasks() {
  const allTasks = await db.select().from(tasks);
  return allTasks;
}

export async function getUserTaskProgress(userId: string, taskId: string) {
  const result = await db
    .select()
    .from(taskProgress)
    .where(
      and(eq(taskProgress.userId, userId), eq(taskProgress.taskId, taskId))
    );
  return result[0];
}

// Module queries
export async function getModuleWithTasks(moduleId: string) {
  return await db
    .select()
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .where(eq(modules.id, moduleId));
}

export async function getPlanSummariesForUser(
  userId: string
): Promise<PlanSummary[]> {
  const planRows = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));

  if (!planRows.length) {
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

  const tasksByPlan = taskRows.reduce((acc, task) => {
    const existing = acc.get(task.planId) ?? [];
    acc.set(task.planId, [...existing, task]);
    return acc;
  }, new Map<string, typeof taskRows>());

  const modulesByPlan = moduleRows.reduce((acc, module) => {
    const existing = acc.get(module.planId) ?? [];
    acc.set(module.planId, [...existing, module]);
    return acc;
  }, new Map<string, typeof moduleRows>());

  const progressByTask = new Map(progressRows.map((row) => [row.taskId, row]));

  return planRows.map((plan) => {
    const tasksForPlan = tasksByPlan.get(plan.id) ?? [];
    const completedTasks = tasksForPlan.filter(
      (task) => progressByTask.get(task.id)?.status === 'completed'
    ).length;
    const totalTasks = tasksForPlan.length;
    const completion = totalTasks ? completedTasks / totalTasks : 0;
    const totalMinutes = tasksForPlan.reduce(
      (sum, task) => sum + (task.estimatedMinutes ?? 0),
      0
    );
    const completedMinutes = tasksForPlan.reduce((sum, task) => {
      const status = progressByTask.get(task.id)?.status;
      if (status === 'completed') {
        return sum + (task.estimatedMinutes ?? 0);
      }
      return sum;
    }, 0);

    const modulesForPlan = modulesByPlan.get(plan.id) ?? [];
    const completedModules = modulesForPlan.filter((module) => {
      const moduleTasks = tasksForPlan.filter(
        (task) => task.moduleId === module.id
      );
      return (
        moduleTasks.length > 0 &&
        moduleTasks.every(
          (task) => progressByTask.get(task.id)?.status === 'completed'
        )
      );
    }).length;

    return {
      plan,
      completedTasks,
      totalTasks,
      completion,
      modules: modulesForPlan,
      totalMinutes,
      completedMinutes,
      completedModules,
    } satisfies PlanSummary;
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

  const progressByTask = new Map(progressRows.map((row) => [row.taskId, row]));

  const resourcesByTask = resourceRows.reduce((acc, row) => {
    const existing = acc.get(row.taskId) ?? [];
    const entry: TaskResourceWithResource = {
      id: row.id,
      taskId: row.taskId,
      resourceId: row.resourceId,
      order: row.order,
      notes: row.notes,
      createdAt: row.createdAt,
      resource: row.resource,
    };
    acc.set(row.taskId, [...existing, entry]);
    return acc;
  }, new Map<string, TaskResourceWithResource[]>());

  const tasksByModule = taskRows.reduce((acc, task) => {
    const entry = {
      ...task,
      resources: resourcesByTask.get(task.id) ?? [],
      progress: progressByTask.get(task.id) ?? null,
    };
    const existing = acc.get(task.moduleId) ?? [];
    acc.set(task.moduleId, [...existing, entry]);
    return acc;
  }, new Map<string, ModuleWithRelations['tasks']>());

  const moduleData = moduleRows.map<ModuleWithRelations>((module) => ({
    ...module,
    tasks: tasksByModule.get(module.id) ?? [],
  }));

  const totalTasks = moduleData.reduce(
    (count, module) => count + module.tasks.length,
    0
  );
  const completedTasks = moduleData.reduce((count, module) => {
    return (
      count +
      module.tasks.filter((task) => task.progress?.status === 'completed')
        .length
    );
  }, 0);

  return {
    plan: {
      ...plan,
      modules: moduleData,
    },
    totalTasks,
    completedTasks,
  };
}
