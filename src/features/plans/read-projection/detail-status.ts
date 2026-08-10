import type {
  PlanStatus as ClientPlanStatus,
  FailureClassification,
} from '@/shared/types/client.types';
import type { GenerationAttempt, LearningPlan } from '@/shared/types/db.types';

import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { derivePlanReadStatus } from '@/features/plans/read-projection/read-status';
import { isKnownFailureClassification } from '@/shared/types/failure-classification';

function toStatusClassification(
  classification: string | null | undefined,
): FailureClassification | 'unknown' | null {
  if (!classification) {
    return null;
  }

  if (isKnownFailureClassification(classification)) {
    return classification;
  }

  return 'unknown';
}

export type PlanDetailStatusSnapshot = {
  planId: string;
  status: ClientPlanStatus;
  attempts: number;
  attemptCap: number;
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
  const attemptCap = getGenerationAttemptCap();

  return {
    planId: plan.id,
    status: derivePlanReadStatus({
      generationStatus: plan.generationStatus,
      hasModules,
      attemptsCount,
      attemptCap,
    }),
    attempts: attemptsCount,
    attemptCap,
    latestClassification: toStatusClassification(latestAttempt?.classification),
    createdAt: plan.createdAt?.toISOString(),
    updatedAt: plan.updatedAt?.toISOString(),
  } satisfies PlanDetailStatusSnapshot;
}
