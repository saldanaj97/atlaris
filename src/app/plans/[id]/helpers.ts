/**
 * Helper functions for plan and schedule access operations.
 *
 * These functions work with the discriminated union types defined in types.ts
 * to create results, check success status, and safely extract error information.
 */

import {
	buildTaskStatusMap,
	derivePlanDetailsCardStats,
	derivePlanOverviewStats,
} from '@/features/plans/task-progress';
import type {
	ClientModule,
	ClientPlanDetail,
} from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';
import type {
	PlanAccessError,
	PlanAccessErrorCode,
	PlanAccessResult,
	PlanDetailsCardStats,
	PlanOverviewStats,
} from './types';

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

/**
 * Helper to create success result
 */
export function planSuccess(data: ClientPlanDetail): PlanAccessResult {
	return { success: true, data };
}

/**
 * Helper to create error result
 */
export function planError(
	code: PlanAccessErrorCode,
	message: string,
): PlanAccessResult {
	return { success: false, error: { code, message } };
}

/**
 * Type guard to check if plan access result is successful
 */
export function isPlanSuccess(
	result: PlanAccessResult,
): result is { success: true; data: ClientPlanDetail } {
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
