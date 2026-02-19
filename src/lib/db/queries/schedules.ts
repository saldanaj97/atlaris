import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import {
  isPlanOwnershipWriteError,
  mapDbRowToScheduleCacheRow,
} from '@/lib/db/queries/helpers/schedule-helpers';
import type { UpsertPlanScheduleCachePayload } from '@/lib/db/queries/types/schedule.types';
import type { getDb } from '@/lib/db/runtime';
import { planSchedules } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import type { ScheduleCacheRow } from '@/lib/scheduling/types';
import { eq } from 'drizzle-orm';

/** RLS-enforced database client for schedule queries. */
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
  const plan = await selectOwnedPlanById({
    planId,
    ownerUserId: userId,
    dbClient,
  });

  if (!plan) {
    logger.warn({ planId, userId }, 'Plan not found or access denied');
    throw new Error('Plan not found or access denied');
  }
}

/**
 * Retrieves the cached schedule for the specified plan.
 * Returns `null` when no cache entry exists yet for an owned plan.
 * Throws when the plan is not owned by the user.
 *
 * @param planId - The ID of the plan whose schedule cache will be retrieved
 * @param userId - The ID of the user who owns the plan
 * @param dbClient - Database client for the query
 * @returns The cached schedule row for the given `planId`, or `null` if no cache exists.
 */
export async function getPlanScheduleCache(
  planId: string,
  userId: string,
  dbClient: DbClient
): Promise<ScheduleCacheRow | null> {
  await validatePlanOwnership(planId, userId, dbClient);

  const [result] = await dbClient
    .select()
    .from(planSchedules)
    .where(eq(planSchedules.planId, planId))
    .limit(1);

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
 * @param dbClient - Database client for the query
 * @throws Error if the plan is not found or the user doesn't own it
 */
export async function upsertPlanScheduleCache(
  planId: string,
  userId: string,
  payload: UpsertPlanScheduleCachePayload,
  dbClient: DbClient
): Promise<void> {
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

  await validatePlanOwnership(planId, userId, dbClient);

  try {
    await dbClient
      .insert(planSchedules)
      .values({ planId, ...cacheFields })
      .onConflictDoUpdate({
        target: planSchedules.planId,
        set: { ...cacheFields, generatedAt: new Date() },
      });
  } catch (error) {
    if (isPlanOwnershipWriteError(error)) {
      logger.warn(
        { planId, userId },
        'Plan write failed - not found or access denied'
      );
      throw new Error('Plan not found or access denied', { cause: error });
    }

    throw error;
  }
}
