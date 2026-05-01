import { differenceInDays } from 'date-fns';
import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import {
  derivePlanReadStatus,
  derivePlanSummaryStatus,
} from '@/features/plans/read-projection/read-status';
import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
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

function deriveClientPlanSummaryStatus(summary: PlanSummary): PlanReadStatus {
  const readStatus = derivePlanReadStatus(
    summary.attemptsCount === undefined
      ? {
          generationStatus: summary.plan.generationStatus,
          hasModules: summary.modules.length > 0,
        }
      : {
          generationStatus: summary.plan.generationStatus,
          hasModules: summary.modules.length > 0,
          attemptsCount: summary.attemptsCount,
          attemptCap: getGenerationAttemptCap(),
        },
  );

  return derivePlanSummaryStatus({
    readStatus,
    completion: summary.completion,
  });
}

export function derivePlanSummaryDisplayStatus(params: {
  summary: PlanSummary;
  referenceDate?: Date | string | null;
}): PlanReadStatus {
  const { summary, referenceDate = new Date() } = params;
  const canonicalStatus = deriveClientPlanSummaryStatus(summary);

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
  return deriveClientPlanSummaryStatus(summary) === 'completed';
}
