import { getAttemptCap } from '@/features/ai/generation-policy';
import {
  accumulateLightweightModuleMetricsRowInPlace,
  computeTaskRowCompletionMetrics,
  countCompletedModulesFromFlatTasks,
} from '@/features/plans/read-models/completion-metrics';
import {
  derivePlanReadStatus,
  derivePlanSummaryStatus,
  type PlanSummaryReadStatus,
} from '@/features/plans/status/read-status';
import type {
  LearningPlan,
  LightweightPlanSummary,
  Module,
  PlanSummary,
  TaskProgress,
} from '@/shared/types/db.types';

export type SummaryTaskRow = {
  id: string;
  moduleId: string;
  planId: string;
  estimatedMinutes: number | null;
};

export type ProgressStatusRow = Pick<TaskProgress, 'taskId' | 'status'>;

export type LightweightPlanRow = Pick<
  LearningPlan,
  | 'id'
  | 'topic'
  | 'skillLevel'
  | 'learningStyle'
  | 'visibility'
  | 'origin'
  | 'generationStatus'
  | 'createdAt'
  | 'updatedAt'
>;

export type LightweightModuleMetricsRow = {
  planId: string;
  totalTasks: number;
  completedTasks: number;
  totalMinutes: number;
  completedMinutes: number;
};

export type { PlanSummaryReadStatus } from '@/features/plans/status/read-status';

export type SummaryStatusInput = {
  plan: Pick<LearningPlan, 'generationStatus'>;
  completion: number;
  modules: Array<{ id: string }>;
  attemptsCount?: number;
};

type LightweightPlanMetrics = Pick<
  LightweightPlanSummary,
  | 'completedTasks'
  | 'totalTasks'
  | 'totalMinutes'
  | 'completedMinutes'
  | 'moduleCount'
  | 'completedModules'
>;

const DEFAULT_LIGHTWEIGHT_PLAN_METRICS: LightweightPlanMetrics = {
  completedTasks: 0,
  totalTasks: 0,
  totalMinutes: 0,
  completedMinutes: 0,
  moduleCount: 0,
  completedModules: 0,
};

export function buildPlanSummaries(params: {
  planRows: LearningPlan[];
  moduleRows: Module[];
  taskRows: SummaryTaskRow[];
  progressRows: ProgressStatusRow[];
  attemptCountsByPlanId?: ReadonlyMap<string, number>;
}): PlanSummary[] {
  const {
    planRows,
    moduleRows,
    taskRows,
    progressRows,
    attemptCountsByPlanId,
  } = params;

  const tasksByPlan = new Map<string, SummaryTaskRow[]>();
  const tasksByModule = new Map<string, SummaryTaskRow[]>();

  for (const task of taskRows) {
    const planTasks = tasksByPlan.get(task.planId) ?? [];
    planTasks.push(task);
    tasksByPlan.set(task.planId, planTasks);

    const moduleTasks = tasksByModule.get(task.moduleId) ?? [];
    moduleTasks.push(task);
    tasksByModule.set(task.moduleId, moduleTasks);
  }

  const modulesByPlan = moduleRows.reduce((acc, planModule) => {
    const existing = acc.get(planModule.planId) ?? [];
    existing.push(planModule);
    acc.set(planModule.planId, existing);
    return acc;
  }, new Map<string, Module[]>());

  const progressByTask = new Map(progressRows.map((row) => [row.taskId, row]));

  return planRows.map((plan) => {
    const tasksForPlan = tasksByPlan.get(plan.id) ?? [];
    const modulesForPlan = modulesByPlan.get(plan.id) ?? [];

    const { totalTasks, completedTasks, totalMinutes, completedMinutes } =
      computeTaskRowCompletionMetrics({
        tasks: tasksForPlan,
        progressByTaskId: progressByTask,
      });
    const completion = totalTasks ? completedTasks / totalTasks : 0;
    const completedModules = countCompletedModulesFromFlatTasks({
      modules: modulesForPlan,
      tasksByModuleId: tasksByModule,
      progressByTaskId: progressByTask,
    });

    return {
      plan,
      completedTasks,
      totalTasks,
      completion,
      modules: modulesForPlan,
      totalMinutes,
      completedMinutes,
      completedModules,
      attemptsCount: attemptCountsByPlanId?.get(plan.id),
    } satisfies PlanSummary;
  });
}

export function deriveCanonicalPlanSummaryStatus(
  summary: SummaryStatusInput
): PlanSummaryReadStatus {
  const readStatus = derivePlanReadStatus({
    generationStatus: summary.plan.generationStatus,
    hasModules: summary.modules.length > 0,
    attemptsCount: summary.attemptsCount,
    attemptCap: getAttemptCap(),
  });

  return derivePlanSummaryStatus({
    readStatus,
    completion: summary.completion,
  });
}

export function buildLightweightPlanSummaries(params: {
  planRows: LightweightPlanRow[];
  moduleMetricsRows: LightweightModuleMetricsRow[];
}): LightweightPlanSummary[] {
  const { planRows, moduleMetricsRows } = params;

  const planMetrics = moduleMetricsRows.reduce((acc, row) => {
    const current = acc.get(row.planId) ?? {
      ...DEFAULT_LIGHTWEIGHT_PLAN_METRICS,
    };

    accumulateLightweightModuleMetricsRowInPlace(current, row);

    acc.set(row.planId, current);
    return acc;
  }, new Map<string, LightweightPlanMetrics>());

  return planRows.map((plan) => {
    const metrics =
      planMetrics.get(plan.id) ?? DEFAULT_LIGHTWEIGHT_PLAN_METRICS;

    return {
      ...plan,
      ...metrics,
      completion: metrics.totalTasks
        ? metrics.completedTasks / metrics.totalTasks
        : 0,
    } satisfies LightweightPlanSummary;
  });
}
