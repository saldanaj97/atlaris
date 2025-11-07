import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/runtime';
import { planSchedules } from '@/lib/db/schema';
import type { ScheduleCacheRow } from '@/lib/scheduling/types';

/**
 * Retrieves the cached schedule for the specified plan.
 *
 * @returns The cached schedule row for the given `planId`, or `null` if no cache exists.
 */
export async function getPlanScheduleCache(
  planId: string
): Promise<ScheduleCacheRow | null> {
  const db = getDb();
  const [result] = await db
    .select()
    .from(planSchedules)
    .where(eq(planSchedules.planId, planId));

  if (!result) return null;

  return {
    planId: result.planId,
    scheduleJson: result.scheduleJson as ScheduleCacheRow['scheduleJson'],
    inputsHash: result.inputsHash,
    generatedAt: result.generatedAt,
    timezone: result.timezone,
    weeklyHours: result.weeklyHours,
    startDate: result.startDate,
    deadline: result.deadline,
  };
}

/**
 * Insert or update the schedule cache for a plan in the database.
 *
 * On conflict by `planId`, updates the stored fields and sets `generatedAt` to the current date/time.
 *
 * @param planId - The ID of the plan whose schedule cache will be created or updated
 * @param payload - Cache values to store; `deadline` may be `null` to indicate no deadline
 */
export async function upsertPlanScheduleCache(
  planId: string,
  payload: {
    scheduleJson: ScheduleCacheRow['scheduleJson'];
    inputsHash: string;
    timezone: string;
    weeklyHours: number;
    startDate: string;
    deadline: string | null;
  }
): Promise<void> {
  const db = getDb();
  await db
    .insert(planSchedules)
    .values({
      planId,
      scheduleJson: payload.scheduleJson,
      inputsHash: payload.inputsHash,
      timezone: payload.timezone,
      weeklyHours: payload.weeklyHours,
      startDate: payload.startDate,
      deadline: payload.deadline,
    })
    .onConflictDoUpdate({
      target: planSchedules.planId,
      set: {
        scheduleJson: payload.scheduleJson,
        inputsHash: payload.inputsHash,
        timezone: payload.timezone,
        weeklyHours: payload.weeklyHours,
        startDate: payload.startDate,
        deadline: payload.deadline,
        generatedAt: new Date(),
      },
    });
}

/**
 * Remove the schedule cache entry for the specified plan.
 *
 * @param planId - The identifier of the plan whose schedule cache will be deleted
 */
export async function deletePlanScheduleCache(planId: string): Promise<void> {
  const db = getDb();
  await db.delete(planSchedules).where(eq(planSchedules.planId, planId));
}
