import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { planSchedules } from '@/lib/db/schema';
import type { ScheduleCacheRow } from '@/lib/scheduling/types';

/**
 * Retrieves cached schedule for a plan
 */
export async function getPlanScheduleCache(
  planId: string
): Promise<ScheduleCacheRow | null> {
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
 * Upserts (insert or update) schedule cache for a plan
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
 * Deletes schedule cache for a plan
 */
export async function deletePlanScheduleCache(planId: string): Promise<void> {
  await db.delete(planSchedules).where(eq(planSchedules.planId, planId));
}
