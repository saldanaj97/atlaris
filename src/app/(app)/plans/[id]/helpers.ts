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
  PlanDetailsCardStats,
  PlanOverviewStats,
} from './types';
import type {
  ClientModule,
  ClientPlanDetail,
} from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

import {
  accessError,
  accessSuccess,
  getAccessError,
  isAccessSuccess,
} from '@/app/(app)/plans/access-result';
import {
  buildTaskStatusMap,
  derivePlanDetailsCardStats,
  derivePlanOverviewStats,
} from '@/features/plans/task-progress/client';

/**
 * Builds a task-status lookup from the modules attached to a plan.
 * @param modules Array of `ClientModule` objects whose tasks should be flattened into the lookup.
 * @returns A `Record` mapping each task id to its `ProgressStatus`, built from `mod.tasks ?? []`.
 */
export function getStatusesFromModules(
  modules: ClientModule[],
): Record<string, ProgressStatus> {
  return buildTaskStatusMap(modules);
}

/**
 * Computes stats for PlanOverviewHeader from plan and task statuses.
 * Pure function - can be called on server or client.
 */
export function computeOverviewStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>,
): PlanOverviewStats {
  return derivePlanOverviewStats(plan, statuses);
}

/**
 * Computes stats for PlanDetailsCard from plan and task statuses.
 * Pure function - can be called on server or client.
 */
export function computeDetailsCardStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>,
): PlanDetailsCardStats {
  return derivePlanDetailsCardStats(plan, statuses);
}

export function planSuccess(data: ClientPlanDetail): PlanAccessResult {
  return accessSuccess(data);
}

export function planError(
  code: PlanAccessErrorCode,
  message: string,
): PlanAccessResult {
  return accessError(code, message);
}

export function isPlanSuccess(
  result: PlanAccessResult,
): result is { success: true; data: ClientPlanDetail } {
  return isAccessSuccess(result);
}

export function getPlanError(result: PlanAccessResult): PlanAccessError {
  return getAccessError(result);
}
