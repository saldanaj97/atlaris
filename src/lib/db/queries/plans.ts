/**
 * Plan-related queries for learning plans, summaries, detail views, and generation attempts.
 * Uses RLS-enforced client by default; pass explicit dbClient for DI/testing.
 */

import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import {
  fetchTaskProgressRows,
  fetchTaskResourceRows,
} from '@/lib/db/queries/helpers/task-relations-helpers';
import {
  mapLearningPlanDetail,
  mapLightweightPlanSummaries,
  mapPlanSummaries,
} from '@/lib/db/queries/mappers';
import type { PlanAttemptsPlanMeta } from '@/lib/db/queries/types/plans.types';
import { getDb } from '@/lib/db/runtime';
import {
  generationAttempts,
  learningPlans,
  modules,
  taskProgress,
  tasks,
} from '@/lib/db/schema';
import {
  assertValidPaginationOptions,
  type PaginationOptions,
} from '@/shared/constants/pagination';
import type {
  GenerationAttempt,
  LearningPlanDetail,
  LightweightPlanSummary,
  PlanSummary,
} from '@/shared/types/db.types';

/** RLS-enforced database client for plan queries (default: getDb()). */
type DbClient = ReturnType<typeof getDb>;
type DeletePlanDbClient = Pick<DbClient, 'delete' | 'select'>;

/** Maximum number of generation attempts to return in attempt history queries. */
const MAX_ATTEMPTS_HISTORY_LIMIT = 10;
const DELETABLE_PLAN_STATUSES = ['ready', 'failed', 'pending_retry'] as const;
type PlanGenerationStatus =
  (typeof learningPlans.$inferSelect)['generationStatus'];

type DeletePlanDeps = {
  selectOwnedPlanById: typeof selectOwnedPlanById;
};

const defaultDeletePlanDeps: DeletePlanDeps = {
  selectOwnedPlanById,
};

function applyPlanListOrderingAndPagination(
  planQuery: {
    orderBy: <TOrderByArg>(column: TOrderByArg) => unknown;
    limit: (n: number) => unknown;
    offset: (n: number) => unknown;
  },
  orderByColumn: ReturnType<typeof desc>,
  options?: PaginationOptions
): void {
  planQuery.orderBy(orderByColumn);
  if (options?.limit !== undefined) {
    planQuery.limit(options.limit);
  }
  if (options?.offset !== undefined) {
    planQuery.offset(options.offset);
  }
}

function userPlanListWhere(userId: string) {
  return eq(learningPlans.userId, userId);
}

function isDeletablePlanStatus(
  status: PlanGenerationStatus
): status is (typeof DELETABLE_PLAN_STATUSES)[number] {
  return DELETABLE_PLAN_STATUSES.includes(
    status as (typeof DELETABLE_PLAN_STATUSES)[number]
  );
}

/**
 * Fetches plan summaries with completion metrics for a user.
 * Returns plans with modules, task counts, progress, and aggregated time estimates.
 *
 * @param userId - Authenticated user ID (RLS scopes results)
 * @param dbClient - Optional client; defaults to getDb()
 * @param options - Optional pagination controls for large plan sets. Invalid
 * options throw RangeError so callers do not silently hide programming mistakes.
 * @returns PlanSummary[] - Empty array if user has no plans
 */
export async function getPlanSummariesForUser(
  userId: string,
  dbClient?: DbClient,
  options?: PaginationOptions
): Promise<PlanSummary[]> {
  const client = dbClient ?? getDb();
  assertValidPaginationOptions(options);

  const planQuery = client
    .select()
    .from(learningPlans)
    .where(userPlanListWhere(userId))
    .$dynamic();

  applyPlanListOrderingAndPagination(
    planQuery,
    desc(learningPlans.createdAt),
    options
  );

  const planRows = await planQuery;

  if (!planRows.length) {
    return [];
  }

  const planIds = planRows.map((plan) => plan.id);

  const [moduleRows, taskRows] = await Promise.all([
    client
      .select()
      .from(modules)
      .where(inArray(modules.planId, planIds))
      .orderBy(asc(modules.order)),
    client
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

  const progressRows = await fetchTaskProgressRows({
    taskIds,
    userId,
    dbClient: client,
  });

  return mapPlanSummaries({
    planRows,
    moduleRows,
    taskRows,
    progressRows,
  });
}

/**
 * Fetches lightweight plan summaries for API list views.
 * Invalid pagination options throw RangeError instead of silently clamping.
 * Excludes large plan payload fields and computes completion via grouped counts.
 */
export async function getLightweightPlanSummaries(
  userId: string,
  dbClient?: DbClient,
  options?: PaginationOptions
): Promise<LightweightPlanSummary[]> {
  const client = dbClient ?? getDb();
  assertValidPaginationOptions(options);

  const planQuery = client
    .select({
      id: learningPlans.id,
      topic: learningPlans.topic,
      skillLevel: learningPlans.skillLevel,
      learningStyle: learningPlans.learningStyle,
      visibility: learningPlans.visibility,
      origin: learningPlans.origin,
      generationStatus: learningPlans.generationStatus,
      createdAt: learningPlans.createdAt,
      updatedAt: learningPlans.updatedAt,
    })
    .from(learningPlans)
    .where(userPlanListWhere(userId))
    .$dynamic();

  applyPlanListOrderingAndPagination(
    planQuery,
    desc(learningPlans.createdAt),
    options
  );

  const planRows = await planQuery;

  if (!planRows.length) {
    return [];
  }

  const planIds = planRows.map((plan) => plan.id);

  const moduleMetricsRows = await client
    .select({
      planId: modules.planId,
      moduleId: modules.id,
      totalTasks: sql<number>`count(${tasks.id})::int`,
      completedTasks: sql<number>`
        count(${taskProgress.id}) filter (
          where ${taskProgress.status} = 'completed'
        )::int
      `,
      totalMinutes: sql<number>`coalesce(sum(${tasks.estimatedMinutes}), 0)::int`,
      completedMinutes: sql<number>`
        coalesce(
          sum(
            case
              when ${taskProgress.status} = 'completed' then ${tasks.estimatedMinutes}
              else 0
            end
          ),
          0
        )::int
      `,
    })
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .leftJoin(
      taskProgress,
      and(eq(taskProgress.taskId, tasks.id), eq(taskProgress.userId, userId))
    )
    .where(inArray(modules.planId, planIds))
    .groupBy(modules.planId, modules.id);

  return mapLightweightPlanSummaries({
    planRows,
    moduleMetricsRows,
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
  dbClient?: DbClient
): Promise<LearningPlanDetail | null> {
  const client = dbClient ?? getDb();

  const plan = await selectOwnedPlanById({
    planId,
    ownerUserId: userId,
    dbClient: client,
  });

  if (!plan) {
    return null;
  }

  // Fire plan-level queries in parallel: modules + generation attempt metadata
  const [moduleRows, attemptMetaRows] = await Promise.all([
    client
      .select()
      .from(modules)
      .where(eq(modules.planId, planId))
      .orderBy(asc(modules.order)),
    client
      .select({
        attempt: generationAttempts,
        attemptsCount: sql<number>`count(*) over ()`,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId))
      .orderBy(desc(generationAttempts.createdAt))
      .limit(1),
  ]);

  const moduleIds = moduleRows.map((module) => module.id);

  const taskRows = moduleIds.length
    ? await client
        .select()
        .from(tasks)
        .where(inArray(tasks.moduleId, moduleIds))
        .orderBy(asc(tasks.order))
    : [];

  const taskIds = taskRows.map((task) => task.id);

  // Fire task-dependent queries in parallel
  const [progressRows, resourceRows] = await Promise.all([
    fetchTaskProgressRows({
      taskIds,
      userId,
      dbClient: client,
    }),
    fetchTaskResourceRows({ taskIds, dbClient: client }),
  ]);

  const attemptsCount = Number(attemptMetaRows[0]?.attemptsCount ?? 0);
  const latestAttemptOrNull: GenerationAttempt | null =
    attemptMetaRows[0]?.attempt ?? null;

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
type PlanAttemptsResult = {
  plan: PlanAttemptsPlanMeta;
  attempts: GenerationAttempt[];
};

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
  dbClient?: DbClient
): Promise<PlanAttemptsResult | null> {
  const client = dbClient ?? getDb();

  const plan = await selectOwnedPlanById({
    planId,
    ownerUserId: userId,
    dbClient: client,
  });

  if (!plan) {
    return null;
  }

  const attempts = await client
    .select()
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, planId))
    .orderBy(desc(generationAttempts.createdAt))
    .limit(MAX_ATTEMPTS_HISTORY_LIMIT);

  const planMeta: PlanAttemptsPlanMeta = {
    id: plan.id,
    topic: plan.topic,
    generationStatus: plan.generationStatus,
  };

  return { plan: planMeta, attempts };
}

/** Explicit failure reasons returned by deletePlan. */
type DeletePlanFailureReason = 'not_found' | 'currently_generating';

/** Result of a plan deletion attempt. */
type DeletePlanResult =
  | { success: true }
  | { success: false; reason: DeletePlanFailureReason };

/**
 * Deletes a plan owned by the authenticated user.
 * Blocks deletion when the plan is actively generating.
 * All child records (modules, tasks, schedules, generations, attempts) are
 * cascade-deleted by the database.
 *
 * @param planId - Plan ID to delete
 * @param userId - Authenticated user ID (ownership enforced via WHERE + RLS)
 * @param dbClient - Optional client; defaults to getDb()
 * @returns DeletePlanResult indicating success or failure reason
 */
export async function deletePlan(
  planId: string,
  userId: string,
  dbClient?: DeletePlanDbClient,
  deps: DeletePlanDeps = defaultDeletePlanDeps
): Promise<DeletePlanResult> {
  const client = dbClient ?? getDb();

  const plan = await deps.selectOwnedPlanById({
    planId,
    ownerUserId: userId,
    dbClient: client,
  });

  if (!plan) {
    return { success: false, reason: 'not_found' };
  }

  if (!isDeletablePlanStatus(plan.generationStatus)) {
    return { success: false, reason: 'currently_generating' };
  }

  const deletedPlans = await client
    .delete(learningPlans)
    .where(
      and(
        eq(learningPlans.id, planId),
        eq(learningPlans.userId, userId),
        inArray(learningPlans.generationStatus, DELETABLE_PLAN_STATUSES)
      )
    )
    .returning({ id: learningPlans.id });

  if (deletedPlans.length > 0) {
    return { success: true };
  }

  const currentPlan = await deps.selectOwnedPlanById({
    planId,
    ownerUserId: userId,
    dbClient: client,
  });

  if (currentPlan?.generationStatus === 'generating') {
    return { success: false, reason: 'currently_generating' };
  }

  return { success: false, reason: 'not_found' };
}

/**
 * Returns the total count of plans for a user. Used for pagination metadata
 * (X-Total-Count header) without fetching full plan rows.
 */
export async function getPlanSummaryCount(
  userId: string,
  dbClient?: DbClient
): Promise<number> {
  const client = dbClient ?? getDb();

  const [result] = await client
    .select({ total: count() })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));

  return result?.total ?? 0;
}
