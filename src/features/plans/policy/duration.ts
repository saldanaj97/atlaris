/**
 * Pure plan duration / tier cap policy — no DB or Drizzle.
 */

import {
  DEFAULT_PLAN_DURATION_WEEKS,
  MILLISECONDS_PER_WEEK,
} from '@/features/plans/validation/learningPlans';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import type { SubscriptionTier } from '@/shared/types/billing.types';

// Explicit upgrade path mapping: current tier -> recommended next tier
const UPGRADE_PATH: Record<SubscriptionTier, SubscriptionTier> = {
  free: 'starter',
  starter: 'pro',
  pro: 'pro',
};

type PlanDurationCapResult = {
  allowed: boolean;
  reason?: string;
  upgradeUrl?: string;
};

/** UTC midnight for today + plan start (defaults today when missing). */
function utcPlanDayAnchors(today: Date, startDate?: string | null) {
  const normalizedToday = new Date(today);
  normalizedToday.setUTCHours(0, 0, 0, 0);

  const start = startDate ? new Date(startDate) : normalizedToday;
  start.setUTCHours(0, 0, 0, 0);

  return { normalizedToday, start };
}

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
  const { start } = utcPlanDayAnchors(today, startDate);

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
  const { normalizedToday, start } = utcPlanDayAnchors(today, startDate);

  const limits = TIER_LIMITS[tier];
  let deadline =
    deadlineDate !== null && deadlineDate !== undefined
      ? new Date(deadlineDate)
      : null;

  if (deadline) {
    deadline.setUTCHours(0, 0, 0, 0);

    if (limits.maxWeeks !== null) {
      const maxDeadline = new Date(
        start.getTime() + limits.maxWeeks * MILLISECONDS_PER_WEEK,
      );
      if (deadline > maxDeadline) {
        deadline = maxDeadline;
      }
    }

    if (limits.maxHours !== null) {
      const weeksByHours = Math.max(
        1,
        Math.floor(limits.maxHours / Math.max(weeklyHours, 1)),
      );
      const maxHoursDeadline = new Date(
        start.getTime() + weeksByHours * MILLISECONDS_PER_WEEK,
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

export function checkPlanDurationCap(params: {
  tier: SubscriptionTier;
  weeklyHours: number;
  totalWeeks: number;
}): PlanDurationCapResult {
  const caps = TIER_LIMITS[params.tier];
  if (caps.maxWeeks !== null && params.totalWeeks > caps.maxWeeks) {
    const recommended = UPGRADE_PATH[params.tier];
    return {
      allowed: false,
      reason: `${params.tier} tier limited to ${caps.maxWeeks}-week plans. Upgrade to ${recommended} for longer plans.`,
      upgradeUrl: '/pricing',
    };
  }
  if (
    caps.maxHours !== null &&
    params.weeklyHours * params.totalWeeks > caps.maxHours
  ) {
    return {
      allowed: false,
      reason: `${params.tier} tier limited to ${caps.maxHours} total hours. Upgrade for more time.`,
      upgradeUrl: '/pricing',
    };
  }
  return { allowed: true };
}
