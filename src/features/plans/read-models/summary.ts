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

export type PlanSummaryReadStatus =
  | 'active'
  | 'completed'
  | 'failed'
  | 'generating';

const COMPLETION_EPSILON = 1e-6;

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
}): PlanSummary[] {
  const { planRows, moduleRows, taskRows, progressRows } = params;

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

    const completedTasks = tasksForPlan.filter(
      (task) => progressByTask.get(task.id)?.status === 'completed'
    ).length;
    const totalTasks = tasksForPlan.length;
    const completion = totalTasks ? completedTasks / totalTasks : 0;
    const totalMinutes = tasksForPlan.reduce(
      (sum, task) => sum + (task.estimatedMinutes ?? 0),
      0
    );
    const completedMinutes = tasksForPlan.reduce((sum, task) => {
      const status = progressByTask.get(task.id)?.status;
      return status === 'completed' ? sum + (task.estimatedMinutes ?? 0) : sum;
    }, 0);
    const completedModules = modulesForPlan.filter((planModule) => {
      const moduleTasks = tasksByModule.get(planModule.id) ?? [];

      return (
        moduleTasks.length > 0 &&
        moduleTasks.every(
          (task) => progressByTask.get(task.id)?.status === 'completed'
        )
      );
    }).length;

    return {
      plan,
      completedTasks,
      totalTasks,
      completion,
      modules: modulesForPlan,
      totalMinutes,
      completedMinutes,
      completedModules,
    } satisfies PlanSummary;
  });
}

export function deriveCanonicalPlanSummaryStatus(
  summary: Pick<PlanSummary, 'plan' | 'completion' | 'modules'>
): PlanSummaryReadStatus {
  const generationStatus = summary.plan.generationStatus;

  if (summary.modules.length > 0) {
    if (summary.completion >= 1 - COMPLETION_EPSILON) {
      return 'completed';
    }

    return 'active';
  }

  if (
    generationStatus === 'generating' ||
    generationStatus === 'pending_retry'
  ) {
    return 'generating';
  }

  if (generationStatus === 'failed') {
    return 'failed';
  }

  if (summary.completion >= 1 - COMPLETION_EPSILON) {
    return 'completed';
  }

  return 'active';
}

export function toLightweightPlanSummaries(
  summaries: PlanSummary[]
): LightweightPlanSummary[] {
  return summaries.map(
    (summary) =>
      ({
        id: summary.plan.id,
        topic: summary.plan.topic,
        skillLevel: summary.plan.skillLevel,
        learningStyle: summary.plan.learningStyle,
        visibility: summary.plan.visibility,
        origin: summary.plan.origin,
        generationStatus: summary.plan.generationStatus,
        createdAt: summary.plan.createdAt,
        updatedAt: summary.plan.updatedAt,
        completion: summary.completion,
        completedTasks: summary.completedTasks,
        totalTasks: summary.totalTasks,
        totalMinutes: summary.totalMinutes,
        completedMinutes: summary.completedMinutes,
        moduleCount: summary.modules.length,
        completedModules: summary.completedModules,
      }) satisfies LightweightPlanSummary
  );
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

    current.completedTasks += row.completedTasks;
    current.totalTasks += row.totalTasks;
    current.totalMinutes += row.totalMinutes;
    current.completedMinutes += row.completedMinutes;
    current.moduleCount += 1;

    if (row.totalTasks > 0 && row.totalTasks === row.completedTasks) {
      current.completedModules += 1;
    }

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
