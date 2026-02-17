import { and, eq } from 'drizzle-orm';

import { mapDbRowToScheduleCacheRow } from '@/lib/db/queries/helpers/schedule-helpers';
import { logger } from '@/lib/logging/logger';
import type { UpsertPlanScheduleCachePayload } from '@/lib/db/queries/types/schedule.types';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, planSchedules } from '@/lib/db/schema';
import type { ScheduleCacheRow } from '@/lib/scheduling/types';

/** RLS-enforced database client for schedule queries (default: getDb()). */
type DbClient = ReturnType<typeof getDb>;

/**
 * Validates that the user owns the plan. Throws if the plan is not found or access is denied.
 *
 * @param planId - The ID of the plan to validate
 * @param userId - The ID of the user who must own the plan
 * @param dbClient - Database client for the query
 * @throws Error if the plan is not found or the user doesn't own it
 */
export async function validatePlanOwnership(
  planId: string,
  userId: string,
  dbClient: DbClient
): Promise<void> {
  const [plan] = await dbClient
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)))
    .limit(1);

  if (!plan) {
    logger.warn({ planId, userId }, 'Plan not found or access denied');
    throw new Error('Plan not found or access denied');
  }
}

/**
 * Retrieves the cached schedule for the specified plan.
 * Validates that the plan belongs to the user before returning cached data.
 *
 * @param planId - The ID of the plan whose schedule cache will be retrieved
 * @param userId - The ID of the user who owns the plan
 * @param dbClient - Optional database client; defaults to getDb()
 * @returns The cached schedule row for the given `planId`, or `null` if no cache exists.
 * @throws Error if the plan is not found or the user doesn't own it
 */
export async function getPlanScheduleCache(
  planId: string,
  userId: string,
  dbClient: DbClient = getDb()
): Promise<ScheduleCacheRow | null> {
  await validatePlanOwnership(planId, userId, dbClient);

  const [result] = await dbClient
    .select()
    .from(planSchedules)
    .where(eq(planSchedules.planId, planId));

  if (!result) return null;

  return mapDbRowToScheduleCacheRow(result);
}

/**
 * Insert or update the schedule cache for a plan in the database.
 * Validates that the plan belongs to the user before writing.
 *
 * On conflict by `planId`, updates the stored fields and sets `generatedAt` to the current date/time.
 *
 * @param planId - The ID of the plan whose schedule cache will be created or updated
 * @param userId - The ID of the user who owns the plan
 * @param payload - Cache values to store; `deadline` may be `null` to indicate no deadline
 * @param dbClient - Optional database client; defaults to getDb()
 * @throws Error if the plan is not found or the user doesn't own it
 */
export async function upsertPlanScheduleCache(
  planId: string,
  userId: string,
  payload: UpsertPlanScheduleCachePayload,
  dbClient: DbClient = getDb()
): Promise<void> {
  await validatePlanOwnership(planId, userId, dbClient);

  const {
    scheduleJson,
    inputsHash,
    timezone,
    weeklyHours,
    startDate,
    deadline,
  } = payload;
  const cacheFields = {
    scheduleJson,
    inputsHash,
    timezone,
    weeklyHours,
    startDate,
    deadline,
  };

  await dbClient
    .insert(planSchedules)
    .values({ planId, ...cacheFields })
    .onConflictDoUpdate({
      target: planSchedules.planId,
      set: { ...cacheFields, generatedAt: new Date() },
    });
}
