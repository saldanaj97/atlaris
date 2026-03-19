import type { PlanStatus } from '@/shared/types/client.types';
import type { GenerationStatus } from '@/shared/types/db.types';

/**
 * Derives the client-facing plan status from database state.
 *
 * State machine:
 *   pending    → plan created, generation not started or between retries
 *   processing → actively generating or pending retry
 *   ready      → generation succeeded (modules exist)
 *   failed     → generation permanently failed or attempt cap exhausted
 *
 * Priority rules:
 *   1. hasModules        → always 'ready' (modules are the ground truth)
 *   2. status 'failed'   → 'failed'
 *   3. status 'generating' | 'pending_retry' → 'processing'
 *   4. attemptsCount ≥ attemptCap            → 'failed' (exhausted)
 *   5. Default           → 'pending'
 */
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

  if (
    generationStatus === 'generating' ||
    generationStatus === 'pending_retry'
  ) {
    return 'processing';
  }

  if (
    generationStatus === 'ready' &&
    typeof attemptsCount === 'number' &&
    attemptsCount < attemptCap
  ) {
    return 'pending';
  }

  if (typeof attemptsCount === 'number' && attemptsCount >= attemptCap) {
    return 'failed';
  }

  if (generationStatus === 'ready') {
    return 'ready';
  }

  return 'pending';
}
