import { count, eq, inArray } from 'drizzle-orm';

import { ATTEMPT_CAP } from '@/lib/ai/generation-policy';
import { getDb } from '@/lib/db/runtime';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import { TIER_LIMITS, type SubscriptionTier } from '@/lib/stripe/tier-limits';
import {
  DEFAULT_PLAN_DURATION_WEEKS,
  MILLISECONDS_PER_WEEK,
} from '@/lib/validation/learningPlans';

export function calculateTotalWeeks({
  startDate,
  deadlineDate,
  today = new Date(),
  defaultWeeks = DEFAULT_PLAN_DURATION_WEEKS,
}: {
  startDate?: string | null;
  deadlineDate?: string | null;
  today?: Date;
  defaultWeeks?: number;
}): number {
  const normalizedToday = new Date(today);
  normalizedToday.setUTCHours(0, 0, 0, 0);

  const start = startDate ? new Date(startDate) : normalizedToday;
  start.setUTCHours(0, 0, 0, 0);

  if (!deadlineDate) {
    return defaultWeeks;
  }

  const deadline = new Date(deadlineDate);
  deadline.setUTCHours(0, 0, 0, 0);
  const diffMs = deadline.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / MILLISECONDS_PER_WEEK));
}

export function normalizePlanDurationForTier({
  tier,
  weeklyHours,
  startDate,
  deadlineDate,
  today = new Date(),
}: {
  tier: SubscriptionTier;
  weeklyHours: number;
  startDate?: string | null;
  deadlineDate?: string | null;
  today?: Date;
}): {
  startDate: string | null;
  deadlineDate: string | null;
  totalWeeks: number;
} {
  const normalizedToday = new Date(today);
  normalizedToday.setUTCHours(0, 0, 0, 0);

  const start = startDate ? new Date(startDate) : normalizedToday;
  start.setUTCHours(0, 0, 0, 0);

  const limits = TIER_LIMITS[tier];
  let deadline =
    deadlineDate !== null && deadlineDate !== undefined
      ? new Date(deadlineDate)
      : null;

  if (deadline) {
    deadline.setUTCHours(0, 0, 0, 0);

    if (limits.maxWeeks !== null) {
      const maxDeadline = new Date(
        start.getTime() + limits.maxWeeks * MILLISECONDS_PER_WEEK
      );
      if (deadline > maxDeadline) {
        deadline = maxDeadline;
      }
    }

    if (limits.maxHours !== null) {
      const weeksByHours = Math.max(
        1,
        Math.floor(limits.maxHours / Math.max(weeklyHours, 1))
      );
      const maxHoursDeadline = new Date(
        start.getTime() + weeksByHours * MILLISECONDS_PER_WEEK
      );
      if (deadline > maxHoursDeadline) {
        deadline = maxHoursDeadline;
      }
    }
  }

  const normalizedStartString = start.toISOString().slice(0, 10);
  const normalizedDeadlineString = deadline
    ? deadline.toISOString().slice(0, 10)
    : (deadlineDate ?? null);

  const totalWeeks = calculateTotalWeeks({
    startDate: normalizedStartString,
    deadlineDate: normalizedDeadlineString,
    today: normalizedToday,
    defaultWeeks: DEFAULT_PLAN_DURATION_WEEKS,
  });

  return {
    startDate: startDate ? normalizedStartString : null,
    deadlineDate: normalizedDeadlineString,
    totalWeeks,
  };
}

export async function findCappedPlanWithoutModules(
  userDbId: string,
  db: ReturnType<typeof getDb> = getDb()
): Promise<string | null> {
  const planRows = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userDbId));

  if (!planRows.length) {
    return null;
  }

  const planIds = planRows.map((row) => row.id);

  const attemptAggregates = await db
    .select({
      planId: generationAttempts.planId,
      count: count(generationAttempts.id).as('count'),
    })
    .from(generationAttempts)
    .where(inArray(generationAttempts.planId, planIds))
    .groupBy(generationAttempts.planId);

  if (!attemptAggregates.length) {
    return null;
  }

  const cappedPlanIds = attemptAggregates
    .filter((row) => row.count >= ATTEMPT_CAP)
    .map((row) => row.planId);

  if (!cappedPlanIds.length) {
    return null;
  }

  const plansWithModules = await db
    .select({ planId: modules.planId })
    .from(modules)
    .where(inArray(modules.planId, cappedPlanIds))
    .groupBy(modules.planId);

  const plansWithModulesSet = new Set(
    plansWithModules.map((row) => row.planId)
  );

  return (
    cappedPlanIds.find((planId) => !plansWithModulesSet.has(planId)) ?? null
  );
}
