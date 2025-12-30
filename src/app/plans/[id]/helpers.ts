/**
 * Helper functions for plan and schedule access operations.
 *
 * These functions work with the discriminated union types defined in types.ts
 * to create results, check success status, and safely extract error information.
 */

import type { ScheduleJson } from '@/lib/scheduling/types';
import type { LearningPlanDetail } from '@/lib/types/db';
import type {
  PlanAccessError,
  PlanAccessErrorCode,
  PlanAccessResult,
  ScheduleAccessResult,
} from './types';

/**
 * Helper to create success result
 */
export function planSuccess(data: LearningPlanDetail): PlanAccessResult {
  return { success: true, data };
}

/**
 * Helper to create error result
 */
export function planError(
  code: PlanAccessErrorCode,
  message: string
): PlanAccessResult {
  return { success: false, error: { code, message } };
}

/**
 * Helper to create schedule success result
 */
export function scheduleSuccess(data: ScheduleJson): ScheduleAccessResult {
  return { success: true, data };
}

/**
 * Helper to create schedule error result
 */
export function scheduleError(
  code: PlanAccessErrorCode,
  message: string
): ScheduleAccessResult {
  return { success: false, error: { code, message } };
}

/**
 * Type guard to check if plan access result is successful
 */
export function isPlanSuccess(
  result: PlanAccessResult
): result is { success: true; data: LearningPlanDetail } {
  return result.success === true;
}

/**
 * Type guard to check if schedule access result is successful
 */
export function isScheduleSuccess(
  result: ScheduleAccessResult
): result is { success: true; data: ScheduleJson } {
  return result.success === true;
}

/**
 * Helper to safely extract error from plan access result
 * Only call this after checking !isPlanSuccess(result)
 */
export function getPlanError(result: PlanAccessResult): PlanAccessError {
  if (result.success === false) {
    return result.error;
  }
  throw new Error('Cannot get error from successful result');
}

/**
 * Helper to safely extract error from schedule access result
 * Only call this after checking !isScheduleSuccess(result)
 */
export function getScheduleError(
  result: ScheduleAccessResult
): PlanAccessError {
  if (result.success === false) {
    return result.error;
  }
  throw new Error('Cannot get error from successful result');
}
