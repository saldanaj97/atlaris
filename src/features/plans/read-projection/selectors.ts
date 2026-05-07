import { differenceInDays } from 'date-fns';
import { deriveCanonicalPlanSummaryStatus } from '@/features/plans/read-projection/summary-status';
import type { PlanReadStatus } from '@/features/plans/read-projection/types';
import { toValidDate } from '@/lib/date/relative-time';
import type { PlanSummary } from '@/shared/types/db.types';

/**
 * UI-facing plan status for list/dashboard: canonical summary status plus
 * inactivity → `paused` when underlying status is `active`.
 *
 * `referenceDate` defaults to `new Date()` so callers only need to pass it when
 * they want deterministic comparisons (for example, tests).
 */
const PLAN_STALENESS_THRESHOLD_DAYS = 30;

export function derivePlanSummaryDisplayStatus(params: {
  summary: PlanSummary;
  referenceDate?: Date | string | null;
}): PlanReadStatus {
  const { summary, referenceDate = new Date() } = params;
  const canonicalStatus = deriveCanonicalPlanSummaryStatus(summary);

  if (canonicalStatus !== 'active') {
    return canonicalStatus;
  }

  const updatedAt = toValidDate(summary.plan.updatedAt);
  if (summary.plan.updatedAt !== null && !updatedAt) {
    return 'active';
  }

  const reference = toValidDate(referenceDate);
  if (!reference) {
    return 'active';
  }

  if (updatedAt) {
    const daysSinceUpdate = differenceInDays(reference, updatedAt);
    if (daysSinceUpdate >= PLAN_STALENESS_THRESHOLD_DAYS) {
      return 'paused';
    }
  }

  return 'active';
}

export function isPlanSummaryFullyComplete(summary: PlanSummary): boolean {
  return deriveCanonicalPlanSummaryStatus(summary) === 'completed';
}
