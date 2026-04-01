import type { PlanAccessError, PlanAccessResult } from '@/app/plans/[id]/types';

/**
 * Builds a failed PlanAccessResult for unit tests (access denied, not found, etc.).
 */
export function createFailedPlanAccessResult(
  errorOverrides: Partial<PlanAccessError> = {}
): PlanAccessResult {
  return {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'missing',
      ...errorOverrides,
    },
  };
}
