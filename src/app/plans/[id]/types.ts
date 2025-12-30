/**
 * Types for plan access operations with explicit error handling.
 *
 * These types enable discriminated union pattern for handling different
 * access scenarios: success, authentication failure, authorization failure,
 * and not-found cases.
 */

import type { LearningPlanDetail } from '@/lib/types/db';
import type { ScheduleJson } from '@/lib/scheduling/types';

/**
 * Error codes for plan access failures.
 * Each code maps to a specific HTTP status and user-facing behavior.
 */
export type PlanAccessErrorCode =
  /** User is not authenticated (401) - redirect to sign-in */
  | 'UNAUTHORIZED'
  /** Plan does not exist (404) - show not found message */
  | 'NOT_FOUND'
  /** User cannot access this plan (403) - show access denied message */
  | 'FORBIDDEN'
  /** Unexpected error during fetch (500) - show generic error */
  | 'INTERNAL_ERROR';

/**
 * Structured error for plan access failures.
 */
export type PlanAccessError = {
  code: PlanAccessErrorCode;
  message: string;
};

/**
 * Result type for plan fetch operations.
 * Uses discriminated union for exhaustive error handling.
 */
export type PlanAccessResult =
  | { success: true; data: LearningPlanDetail }
  | { success: false; error: PlanAccessError };

/**
 * Result type for schedule fetch operations.
 * Uses discriminated union for exhaustive error handling.
 */
export type ScheduleAccessResult =
  | { success: true; data: ScheduleJson }
  | { success: false; error: PlanAccessError };

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
