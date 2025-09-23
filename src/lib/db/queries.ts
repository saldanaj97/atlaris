import {
  mapLearningPlanDetail,
  mapPlanSummaries,
} from '@/lib/mappers/planQueries';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { LearningPlanDetail, PlanSummary } from '@/lib/types/db';

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
  });
}
