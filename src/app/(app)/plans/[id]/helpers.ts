/**
 * Helper functions for plan and schedule access operations.
 *
 * These functions work with the discriminated union types defined in types.ts
 * to create results, check success status, and safely extract error information.
 */

import type {
  PlanAccessError,
  PlanAccessErrorCode,
  PlanAccessResult,
} from './types';
import type { AccessError } from '@/app/(app)/plans/access-result';
import type { ClientPlanDetail } from '@/shared/types/client.types';

import {
  accessError,
  accessSuccess,
  getAccessError,
  isAccessSuccess,
} from '@/app/(app)/plans/access-result';

export function planSuccess(data: ClientPlanDetail): PlanAccessResult {
  return accessSuccess(data);
}

export function planError(
  code: PlanAccessErrorCode,
  message: string,
  candidates?: AccessError['candidates'],
): PlanAccessResult {
  return accessError(code, message, candidates);
}

export function isPlanSuccess(
  result: PlanAccessResult,
): result is { success: true; data: ClientPlanDetail } {
  return isAccessSuccess(result);
}

export function getPlanError(result: PlanAccessResult): PlanAccessError {
  return getAccessError(result);
}
