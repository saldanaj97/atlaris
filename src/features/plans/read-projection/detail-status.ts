import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { derivePlanReadStatus } from '@/features/plans/read-projection/read-status';
import type {
  PlanStatus as ClientPlanStatus,
  FailureClassification,
} from '@/shared/types/client.types';
import type { GenerationAttempt, LearningPlan } from '@/shared/types/db.types';
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
      attemptCap: getGenerationAttemptCap(),
    }),
    attempts: attemptsCount,
    latestClassification: toStatusClassification(latestAttempt?.classification),
    createdAt: plan.createdAt?.toISOString(),
    updatedAt: plan.updatedAt?.toISOString(),
  } satisfies PlanDetailStatusSnapshot;
}
