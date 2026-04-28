import type { PlanStatus as ClientPlanStatus } from '@/shared/types/client.types';
import type { GenerationStatus } from '@/shared/types/db.types';

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

export function derivePlanReadStatus(
  params: PlanReadStatusInput,
): PlanReadStatus {
  const { generationStatus, hasModules, attemptsCount, attemptCap } = params;

  if (hasModules) {
    return 'ready';
  }

  switch (generationStatus) {
    case 'failed':
      return 'failed';
    case 'generating':
    case 'pending_retry':
      return 'processing';
    case 'ready':
      if (typeof attemptsCount === 'number' && typeof attemptCap === 'number') {
        return attemptsCount >= attemptCap ? 'failed' : 'pending';
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
