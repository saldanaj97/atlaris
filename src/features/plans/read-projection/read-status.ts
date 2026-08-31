import type { PlanReadStatus as PlanDisplayStatus } from '@/features/plans/read-projection/types';
import type {
  FailureClassification,
  PlanStatus as ClientPlanStatus,
} from '@/shared/types/client.types';
import type {
  GenerationAttempt,
  GenerationStatus,
  LearningPlan,
  PlanSummary,
} from '@/shared/types/db.types';

import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { toValidDate } from '@/lib/date/relative-time';
import { isKnownFailureClassification } from '@/shared/types/failure-classification';

/**
 * Canonical read-layer status used by detail and polling consumers.
 */
type PlanReadStatus = ClientPlanStatus;

/**
 * Summary/list-layer status derived from the canonical read status plus progress.
 */
export type PlanSummaryReadStatus =
  | 'active'
  | 'completed'
  | 'failed'
  | 'generating';

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
    };

/**
 * Summary inputs layered on top of the canonical read status.
 */
type PlanSummaryStatusInput = {
  readStatus: PlanReadStatus;
  completion: number;
};

/**
 * Minimal plan summary inputs for canonical list-layer status (no UI staleness).
 */
export type SummaryStatusInput = {
  plan: Pick<LearningPlan, 'generationStatus'>;
  completion: number;
  modules: Array<{ id: string }>;
  attemptsCount?: number;
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

const PLAN_STALENESS_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

export function derivePlanSummaryStatus(
  params: PlanSummaryStatusInput,
): PlanSummaryReadStatus {
  const { readStatus, completion } = params;

  switch (readStatus) {
    case 'failed':
      return 'failed';
    case 'pending':
    case 'processing':
      return 'generating';
    case 'ready':
      return completion >= 1 ? 'completed' : 'active';
    default: {
      const exhaustiveStatus: never = readStatus;
      throw new Error(`Unhandled read status: ${String(exhaustiveStatus)}`);
    }
  }
}

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

/**
 * UI-facing plan status for list/dashboard: canonical summary status plus
 * no progress → `not_started` and inactivity → `paused` when underlying
 * status is `active`.
 *
 * `referenceDate` defaults to `new Date()` so callers only need to pass it when
 * they want deterministic comparisons (for example, tests).
 */
export function derivePlanSummaryDisplayStatus(params: {
  summary: PlanSummary;
  referenceDate?: Date | string | null;
}): PlanDisplayStatus {
  const { summary, referenceDate = new Date() } = params;
  const canonicalStatus = deriveCanonicalPlanSummaryStatus(summary);

  if (canonicalStatus !== 'active') {
    return canonicalStatus;
  }

  if (summary.modules.length > 0 && summary.completedTasks === 0) {
    return 'not_started';
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
    const daysSinceUpdate = Math.trunc(
      (reference.getTime() - updatedAt.getTime()) / MS_PER_DAY,
    );
    if (daysSinceUpdate >= PLAN_STALENESS_THRESHOLD_DAYS) {
      return 'paused';
    }
  }

  return 'active';
}

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
