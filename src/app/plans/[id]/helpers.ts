/**
 * Helper functions for plan and schedule access operations.
 *
 * These functions work with the discriminated union types defined in types.ts
 * to create results, check success status, and safely extract error information.
 */

import { formatSkillLevel } from '@/features/plans/formatters';
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
  modules: ClientModule[]
): Record<string, ProgressStatus> {
  return Object.fromEntries(
    modules.flatMap((mod) =>
      (mod.tasks ?? []).map((task) => [task.id, task.status] as const)
    )
  );
}

/**
 * Computes stats for PlanOverviewHeader from plan and task statuses.
 * Pure function - can be called on server or client.
 */
export function computeOverviewStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>
): PlanOverviewStats {
  const modules = plan.modules ?? [];
  const sharedStats = computeSharedPlanStats(plan, statuses);

  const completedModules = modules.filter((mod) => {
    const moduleTasks = mod.tasks ?? [];
    if (moduleTasks.length === 0) return false;
    return moduleTasks.every(
      (task) => (statuses[task.id] ?? task.status) === 'completed'
    );
  }).length;

  const estimatedCompletionDate = computeEstimatedCompletionDate(
    sharedStats.estimatedWeeks
  );
  const tags = computeTags(plan, modules);

  return {
    completedTasks: sharedStats.completedTasks,
    totalTasks: sharedStats.totalTasks,
    completionPercentage: sharedStats.completionPercentage,
    totalMinutes: sharedStats.totalMinutes,
    estimatedWeeks: sharedStats.estimatedWeeks,
    completedModules,
    totalModules: modules.length,
    estimatedCompletionDate,
    tags,
  };
}

/**
 * Computes stats for PlanDetailsCard from plan and task statuses.
 * Pure function - can be called on server or client.
 */
export function computeDetailsCardStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>
): PlanDetailsCardStats {
  const sharedStats = computeSharedPlanStats(plan, statuses);

  return {
    completedTasks: sharedStats.completedTasks,
    totalTasks: sharedStats.totalTasks,
    totalMinutes: sharedStats.totalMinutes,
    completionPercentage: sharedStats.completionPercentage,
    estimatedWeeks: sharedStats.estimatedWeeks,
  };
}

function computeSharedPlanStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>
) {
  const completedTasks = (plan.modules ?? []).reduce(
    (count, module) =>
      count +
      (module.tasks ?? []).reduce((taskCount, task) => {
        const nextStatus = statuses[task.id] ?? task.status;

        if (task.status === nextStatus) {
          return taskCount;
        }

        if (task.status === 'completed') {
          return taskCount - 1;
        }

        return nextStatus === 'completed' ? taskCount + 1 : taskCount;
      }, 0),
    plan.completedTasks ?? 0
  );
  const totalTasks = plan.totalTasks;
  const totalMinutes = plan.totalMinutes;
  const estimatedWeeks = plan.weeklyHours
    ? Math.ceil(totalMinutes / (plan.weeklyHours * 60))
    : null;
  const completionPercentage = totalTasks
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  return {
    completedTasks,
    totalTasks,
    totalMinutes,
    estimatedWeeks,
    completionPercentage,
  };
}

/**
 * Computes estimated completion date from weeks.
 */
function computeEstimatedCompletionDate(
  estimatedWeeks: number | null
): string | null {
  if (!estimatedWeeks) return null;
  const date = new Date();
  date.setDate(date.getDate() + estimatedWeeks * 7);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Generates tags from plan metadata.
 */
function computeTags(
  plan: ClientPlanDetail,
  modules: ClientModule[]
): string[] {
  const result: string[] = [];
  result.push(formatSkillLevel(plan.skillLevel));
  if (plan.weeklyHours) {
    result.push(`${plan.weeklyHours}h/week`);
  }
  if (modules.length > 0) {
    result.push(`${modules.length} modules`);
  }
  return result;
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
  message: string
): PlanAccessResult {
  return { success: false, error: { code, message } };
}

/**
 * Type guard to check if plan access result is successful
 */
export function isPlanSuccess(
  result: PlanAccessResult
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
