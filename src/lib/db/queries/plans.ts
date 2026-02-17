/**
 * Plan-related queries for learning plans, summaries, detail views, and generation attempts.
 * Uses RLS-enforced client by default; pass explicit dbClient for DI/testing.
 */
import type { TaskResourceWithResource } from '@/lib/db/queries/types/modules.types';
import type { PlanAttemptsPlanMeta } from '@/lib/db/queries/types/plans.types';
import { getDb } from '@/lib/db/runtime';
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
import type {
  GenerationAttempt,
  LearningPlanDetail,
  PlanSummary,
} from '@/lib/types/db';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';

/** RLS-enforced database client for plan queries (default: getDb()). */
type DbClient = ReturnType<typeof getDb>;

/**
 * Fetches plan summaries with completion metrics for a user.
 * Returns plans with modules, task counts, progress, and aggregated time estimates.
 *
 * @param userId - Authenticated user ID (RLS scopes results)
 * @param dbClient - Optional client; defaults to getDb()
 * @returns PlanSummary[] - Empty array if user has no plans
 */
export async function getPlanSummariesForUser(
  userId: string,
  dbClient: DbClient = getDb()
): Promise<PlanSummary[]> {
  const planRows = await dbClient
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));

  if (!planRows.length) {
    // TODO - If adding pagination or filtering (e.g., by topic or status) ensure multiple
    // conditions are combined via a single where(and(...)) call instead of chaining.
    return [];
  }

  const planIds = planRows.map((plan) => plan.id);

  const [moduleRows, taskRows] = await Promise.all([
    dbClient
      .select()
      .from(modules)
      .where(inArray(modules.planId, planIds))
      .orderBy(asc(modules.order)),
    dbClient
      .select({
        id: tasks.id,
        moduleId: tasks.moduleId,
        planId: modules.planId,
        estimatedMinutes: tasks.estimatedMinutes,
      })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .where(inArray(modules.planId, planIds)),
  ]);

  const taskIds = taskRows.map((task) => task.id);

  const progressRows = taskIds.length
    ? await dbClient
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

/**
 * Fetches full plan detail for a single plan: modules, tasks, resources, progress,
 * and generation attempt metadata. Used for plan detail pages.
 *
 * @param planId - Plan ID
 * @param userId - Authenticated user ID (ownership check; returns null if mismatch)
 * @param dbClient - Optional client; defaults to getDb()
 * @returns LearningPlanDetail or null if plan not found or not owned by user
 */
export async function getLearningPlanDetail(
  planId: string,
  userId: string,
  dbClient: DbClient = getDb()
): Promise<LearningPlanDetail | null> {
  const planRow = await dbClient
    .select()
    .from(learningPlans)
    .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)))
    .limit(1);

  if (!planRow.length) {
    return null;
  }

  const plan = planRow[0];

  const moduleRows = await dbClient
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(asc(modules.order));

  const moduleIds = moduleRows.map((module) => module.id);

  const taskRows = moduleIds.length
    ? await dbClient
        .select()
        .from(tasks)
        .where(inArray(tasks.moduleId, moduleIds))
        .orderBy(asc(tasks.order))
    : [];

  const taskIds = taskRows.map((task) => task.id);

  const [
    progressRows,
    resourceRows,
    [{ attemptCount } = { attemptCount: 0 }],
    [latestAttempt],
  ] = await Promise.all([
    taskIds.length
      ? dbClient
          .select()
          .from(taskProgress)
          .where(
            and(
              eq(taskProgress.userId, userId),
              inArray(taskProgress.taskId, taskIds)
            )
          )
      : ([] as (typeof taskProgress.$inferSelect)[]),
    taskIds.length
      ? dbClient
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
      : ([] as TaskResourceWithResource[]),
    dbClient
      .select({ attemptCount: count(generationAttempts.id) })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId)),
    dbClient
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId))
      .orderBy(desc(generationAttempts.createdAt))
      .limit(1),
  ]);

  const attemptsCount = Number(attemptCount ?? 0);
  const latestAttemptOrNull: GenerationAttempt | null = latestAttempt ?? null;

  return mapLearningPlanDetail({
    plan,
    moduleRows,
    taskRows,
    progressRows,
    resourceRows,
    latestAttempt: latestAttemptOrNull,
    attemptsCount,
  });
}

/** Return type for getPlanAttemptsForUser. */
export interface PlanAttemptsResult {
  plan: PlanAttemptsPlanMeta;
  attempts: GenerationAttempt[];
}

/**
 * Fetches all generation attempts for a plan, ordered by creation (newest first).
 * Verifies plan ownership before returning; returns null if plan not found.
 *
 * @param planId - Plan ID
 * @param userId - Authenticated user ID (ownership check)
 * @param dbClient - Optional client; defaults to getDb()
 * @returns { plan, attempts } or null if plan not found or not owned by user
 */
export async function getPlanAttemptsForUser(
  planId: string,
  userId: string,
  dbClient: DbClient = getDb()
): Promise<PlanAttemptsResult | null> {
  const planRow = await dbClient
    .select({
      id: learningPlans.id,
      topic: learningPlans.topic,
      generationStatus: learningPlans.generationStatus,
    })
    .from(learningPlans)
    .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)))
    .limit(1);

  if (!planRow.length) {
    return null;
  }

  const attempts = await dbClient
    .select()
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, planId))
    .orderBy(desc(generationAttempts.createdAt));

  return { plan: planRow[0], attempts };
}
