import type { PlanStatus } from '@/lib/types/client';
import type { GenerationStatus } from '@/lib/types/db';

export function derivePlanStatus(params: {
  generationStatus: GenerationStatus;
  hasModules: boolean;
  attemptsCount?: number;
  attemptCap?: number;
}): PlanStatus {
  const {
    generationStatus,
    hasModules,
    attemptsCount,
    attemptCap = Number.POSITIVE_INFINITY,
  } = params;

  if (hasModules) {
    return 'ready';
  }

  if (generationStatus === 'failed') {
    return 'failed';
  }

  if (generationStatus === 'generating') {
    return 'processing';
  }

  if (
    generationStatus === 'ready' &&
    typeof attemptsCount === 'number' &&
    attemptsCount < attemptCap
  ) {
    return 'pending';
  }

  if (generationStatus === 'ready') {
    return 'ready';
  }

  return 'pending';
}
