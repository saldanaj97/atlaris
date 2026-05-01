import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import {
  derivePlanReadStatus,
  derivePlanSummaryStatus,
  type PlanSummaryReadStatus,
} from '@/features/plans/read-projection/read-status';
import type { LearningPlan } from '@/shared/types/db.types';

/**
 * Minimal plan summary inputs for canonical list-layer status (no UI staleness).
 */
export type SummaryStatusInput = {
  plan: Pick<LearningPlan, 'generationStatus'>;
  completion: number;
  modules: Array<{ id: string }>;
  attemptsCount?: number;
};

export function deriveCanonicalPlanSummaryStatus(
  summary: SummaryStatusInput,
  attemptCap: number = getGenerationAttemptCap(),
): PlanSummaryReadStatus {
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
          attemptCap,
        },
  );

  return derivePlanSummaryStatus({
    readStatus,
    completion: summary.completion,
  });
}
