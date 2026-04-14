import { getAttemptCap } from '@/features/ai/generation-policy';
import { derivePlanReadStatus } from '@/features/plans/status/read-status';
import type {
  PlanStatus as ClientPlanStatus,
  FailureClassification,
} from '@/shared/types/client.types';
import type { GenerationAttempt, LearningPlan } from '@/shared/types/db.types';

function toStatusClassification(
  classification: string | null | undefined
): FailureClassification | 'unknown' | null {
  if (!classification) {
    return null;
  }

  if (
    classification === 'validation' ||
    classification === 'conflict' ||
    classification === 'provider_error' ||
    classification === 'rate_limit' ||
    classification === 'timeout' ||
    classification === 'capped'
  ) {
    return classification;
  }

  return 'unknown';
}

export type PlanDetailStatusSnapshot = {
  planId: string;
  status: ClientPlanStatus;
  attempts: number;
  latestClassification: FailureClassification | 'unknown' | null;
  createdAt: string | undefined;
  updatedAt: string | undefined;
};

export function buildPlanDetailStatusSnapshot(params: {
  plan: Pick<
    LearningPlan,
    'id' | 'generationStatus' | 'createdAt' | 'updatedAt'
  >;
  hasModules: boolean;
  attemptsCount: number;
  latestAttempt: Pick<GenerationAttempt, 'classification'> | null;
}): PlanDetailStatusSnapshot {
  const { plan, hasModules, attemptsCount, latestAttempt } = params;

  return {
    planId: plan.id,
    status: derivePlanReadStatus({
      generationStatus: plan.generationStatus,
      hasModules,
      attemptsCount,
      attemptCap: getAttemptCap(),
    }),
    attempts: attemptsCount,
    latestClassification: toStatusClassification(latestAttempt?.classification),
    createdAt: plan.createdAt?.toISOString(),
    updatedAt: plan.updatedAt?.toISOString(),
  } satisfies PlanDetailStatusSnapshot;
}
