import { and, count, eq, gte, notExists } from 'drizzle-orm';

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
  db: ReturnType<typeof getDb>
): Promise<string | null> {
  const [row] = await db
    .select({ planId: generationAttempts.planId })
    .from(generationAttempts)
    .innerJoin(learningPlans, eq(generationAttempts.planId, learningPlans.id))
    .where(
      and(
        eq(learningPlans.userId, userDbId),
        notExists(
          db
            .select({ planId: modules.planId })
            .from(modules)
            .where(eq(modules.planId, generationAttempts.planId))
        )
      )
    )
    .groupBy(generationAttempts.planId)
    .having(gte(count(generationAttempts.id), ATTEMPT_CAP))
    .limit(1);

  return row?.planId ?? null;
}
