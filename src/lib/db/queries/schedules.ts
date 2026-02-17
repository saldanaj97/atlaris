import { mapDbRowToScheduleCacheRow } from '@/lib/db/queries/helpers/schedule-helpers';
import type { UpsertPlanScheduleCachePayload } from '@/lib/db/queries/types/schedule.types';
import { getDb } from '@/lib/db/runtime';
import { planSchedules } from '@/lib/db/schema';
import type { ScheduleCacheRow } from '@/lib/scheduling/types';
import { eq } from 'drizzle-orm';

/** RLS-enforced database client for schedule queries (default: getDb()). */
type DbClient = ReturnType<typeof getDb>;

/**
 * Retrieves the cached schedule for the specified plan.
 *
 * @param planId - The ID of the plan whose schedule cache will be retrieved
 * @param dbClient - Optional database client; defaults to getDb()
 * @returns The cached schedule row for the given `planId`, or `null` if no cache exists.
 */
export async function getPlanScheduleCache(
  planId: string,
  dbClient: DbClient = getDb()
): Promise<ScheduleCacheRow | null> {
  const [result] = await dbClient
    .select()
    .from(planSchedules)
    .where(eq(planSchedules.planId, planId));

  if (!result) return null;

  return mapDbRowToScheduleCacheRow(result);
}

/**
 * Insert or update the schedule cache for a plan in the database.
 *
 * On conflict by `planId`, updates the stored fields and sets `generatedAt` to the current date/time.
 *
 * @param planId - The ID of the plan whose schedule cache will be created or updated
 * @param payload - Cache values to store; `deadline` may be `null` to indicate no deadline
 * @param dbClient - Optional database client; defaults to getDb()
 */
export async function upsertPlanScheduleCache(
  planId: string,
  payload: UpsertPlanScheduleCachePayload,
  dbClient: DbClient = getDb()
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

  await dbClient
    .insert(planSchedules)
    .values({ planId, ...cacheFields })
    .onConflictDoUpdate({
      target: planSchedules.planId,
      set: { ...cacheFields, generatedAt: new Date() },
    });
}

/**
 * Remove the schedule cache entry for the specified plan.
 *
 * @param planId - The identifier of the plan whose schedule cache will be deleted
 * @param dbClient - Optional database client; defaults to getDb()
 */
export async function deletePlanScheduleCache(
  planId: string,
  dbClient: DbClient = getDb()
): Promise<void> {
  await dbClient.delete(planSchedules).where(eq(planSchedules.planId, planId));
}
