/**
 * Helper functions for plan and schedule access operations.
 *
 * These functions work with the discriminated union types defined in types.ts
 * to create results, check success status, and safely extract error information.
 */

import { formatSkillLevel } from '@/lib/formatters';

import type { ScheduleJson } from '@/lib/scheduling/types';
import type { ClientModule, ClientPlanDetail } from '@/lib/types/client';
import type { LearningPlanDetail, ProgressStatus } from '@/lib/types/db';
import type {
  PlanAccessError,
  PlanAccessErrorCode,
  PlanAccessResult,
  PlanDetailsCardStats,
  PlanOverviewStats,
  ScheduleAccessResult,
} from './types';

/**
 * Computes stats for PlanOverviewHeader from plan and task statuses.
 * Pure function - can be called on server or client.
 */
export function computeOverviewStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>
): PlanOverviewStats {
  const modules = plan.modules ?? [];
  const tasks = modules.flatMap((m) => m.tasks ?? []);

  const totalTasks = tasks.length;
  // Only count statuses for task IDs that exist in the current task list
  // This prevents orphaned status entries from inflating the completion count
  const taskIdSet = new Set(tasks.map((t) => t.id));
  const completedTasks = Object.entries(statuses).filter(
    ([id, status]) => taskIdSet.has(id) && status === 'completed'
  ).length;
  const totalMinutes = tasks.reduce(
    (sum, t) => sum + (t.estimatedMinutes ?? 0),
    0
  );
  const estimatedWeeks = plan.weeklyHours
    ? Math.ceil(totalMinutes / (plan.weeklyHours * 60))
    : null;
  const completionPercentage =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const completedModules = modules.filter((mod) => {
    const moduleTasks = mod.tasks ?? [];
    if (moduleTasks.length === 0) return false;
    return moduleTasks.every((task) => statuses[task.id] === 'completed');
  }).length;

  const estimatedCompletionDate =
    computeEstimatedCompletionDate(estimatedWeeks);
  const tags = computeTags(plan, modules);

  return {
    completedTasks,
    totalTasks,
    completionPercentage,
    totalMinutes,
    estimatedWeeks,
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
  const modules = plan.modules ?? [];

  const completedTasks = Object.values(statuses).filter(
    (status) => status === 'completed'
  ).length;

  const totalTasks = modules.reduce(
    (count, module) => count + (module.tasks?.length ?? 0),
    0
  );

  const totalMinutes = modules.reduce(
    (sum, module) =>
      sum +
      (module.tasks ?? []).reduce(
        (moduleSum, task) => moduleSum + (task.estimatedMinutes ?? 0),
        0
      ),
    0
  );

  const completionPercentage = totalTasks
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const estimatedWeeks = plan.weeklyHours
    ? Math.ceil(totalMinutes / (plan.weeklyHours * 60))
    : null;

  return {
    completedTasks,
    totalTasks,
    totalMinutes,
    completionPercentage,
    estimatedWeeks,
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
