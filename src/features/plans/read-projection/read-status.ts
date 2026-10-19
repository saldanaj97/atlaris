import type {
  FailureClassification,
  PlanStatus as ClientPlanStatus,
} from '@/shared/types/client.types';
import type {
  GenerationAttempt,
  GenerationStatus,
  LearningPlan,
} from '@/shared/types/db.types';

import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { isKnownFailureClassification } from '@/shared/types/failure-classification';

/**
 * Canonical read-layer status used by detail and polling consumers.
 */
type PlanReadStatus = ClientPlanStatus;

/**
 * Raw plan lifecycle inputs needed to derive the canonical read status.
 */
type PlanReadStatusInput =
  | {
      generationStatus: GenerationStatus;
      hasModules: boolean;
      attemptsCount?: never;
      attemptCap?: never;
    }
  | {
      generationStatus: GenerationStatus;
      hasModules: boolean;
      attemptsCount: number;
      attemptCap: number;
      /**
       * The latest attempt is still running. A `generating` plan whose final
       * allowed attempt is in flight reads `processing`, not `failed`.
       */
      latestAttemptInProgress?: boolean;
    };

export type PlanDetailStatusSnapshot = {
  planId: string;
  status: ClientPlanStatus;
  attempts: number;
  attemptCap: number;
  latestClassification: FailureClassification | 'unknown' | null;
  createdAt: string | undefined;
  updatedAt: string | undefined;
};

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

export function derivePlanReadStatus(
  params: PlanReadStatusInput,
): PlanReadStatus {
  const { generationStatus, hasModules, attemptsCount, attemptCap } = params;

  if (hasModules) {
    return 'ready';
  }

  const attemptsExhausted =
    typeof attemptsCount === 'number' &&
    typeof attemptCap === 'number' &&
    attemptsCount >= attemptCap;

  switch (generationStatus) {
    case 'failed':
      return 'failed';
    case 'generating':
      return attemptsExhausted && params.latestAttemptInProgress !== true
        ? 'failed'
        : 'processing';
    case 'pending_retry':
      return attemptsExhausted ? 'failed' : 'processing';
    case 'ready':
      if (typeof attemptsCount === 'number' && typeof attemptCap === 'number') {
        return attemptsExhausted ? 'failed' : 'pending';
      }
      return 'ready';
    default: {
      const exhaustiveStatus: never = generationStatus;
      throw new Error(
        `Unhandled generation status: ${String(exhaustiveStatus)}`,
      );
    }
  }
}

export function buildPlanDetailStatusSnapshot(params: {
  plan: Pick<
    LearningPlan,
    'id' | 'generationStatus' | 'createdAt' | 'updatedAt'
  >;
  hasModules: boolean;
  attemptsCount: number;
  latestAttempt: Pick<GenerationAttempt, 'classification' | 'status'> | null;
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
      latestAttemptInProgress: latestAttempt?.status === 'in_progress',
    }),
    attempts: attemptsCount,
    attemptCap,
    latestClassification: toStatusClassification(latestAttempt?.classification),
    createdAt: plan.createdAt?.toISOString(),
    updatedAt: plan.updatedAt?.toISOString(),
  } satisfies PlanDetailStatusSnapshot;
}
