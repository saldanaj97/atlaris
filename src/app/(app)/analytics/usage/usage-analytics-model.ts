import type { LightweightPlanSummary } from '@/shared/types/db.types';

export type UsageAnalyticsPlanRow = {
  id: string;
  topic: string;
  completedTasks: number;
  totalTasks: number;
  taskCompletionPercent: number;
  completedModules: number;
  totalModules: number;
  moduleCompletionPercent: number;
  completedMinutes: number;
  totalMinutes: number;
};

export type UsageAnalyticsModel = {
  plans: UsageAnalyticsPlanRow[];
  planCount: number;
  completedTasks: number;
  totalTasks: number;
  taskCompletionPercent: number;
  completedModules: number;
  totalModules: number;
  moduleCompletionPercent: number;
  completedMinutes: number;
  totalMinutes: number;
  hasPlans: boolean;
  hasCompletedWork: boolean;
};

function completionPercent(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function buildUsageAnalyticsModel(
  summaries: LightweightPlanSummary[],
): UsageAnalyticsModel {
  const plans = summaries.map((summary) => ({
    id: summary.id,
    topic: summary.topic,
    completedTasks: summary.completedTasks,
    totalTasks: summary.totalTasks,
    taskCompletionPercent: completionPercent(
      summary.completedTasks,
      summary.totalTasks,
    ),
    completedModules: summary.completedModules,
    totalModules: summary.moduleCount,
    moduleCompletionPercent: completionPercent(
      summary.completedModules,
      summary.moduleCount,
    ),
    completedMinutes: summary.completedMinutes,
    totalMinutes: summary.totalMinutes,
  }));

  const totals = plans.reduce(
    (acc, plan) => {
      acc.completedTasks += plan.completedTasks;
      acc.totalTasks += plan.totalTasks;
      acc.completedModules += plan.completedModules;
      acc.totalModules += plan.totalModules;
      acc.completedMinutes += plan.completedMinutes;
      acc.totalMinutes += plan.totalMinutes;
      return acc;
    },
    {
      completedTasks: 0,
      totalTasks: 0,
      completedModules: 0,
      totalModules: 0,
      completedMinutes: 0,
      totalMinutes: 0,
    },
  );

  return {
    plans,
    planCount: plans.length,
    completedTasks: totals.completedTasks,
    totalTasks: totals.totalTasks,
    taskCompletionPercent: completionPercent(
      totals.completedTasks,
      totals.totalTasks,
    ),
    completedModules: totals.completedModules,
    totalModules: totals.totalModules,
    moduleCompletionPercent: completionPercent(
      totals.completedModules,
      totals.totalModules,
    ),
    completedMinutes: totals.completedMinutes,
    totalMinutes: totals.totalMinutes,
    hasPlans: plans.length > 0,
    hasCompletedWork: totals.completedTasks > 0,
  };
}
