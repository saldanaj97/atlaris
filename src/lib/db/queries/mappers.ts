import type {
  ModuleWithTasks,
  TaskResourceWithResource,
} from '@/lib/db/queries/types/modules.types';
import type {
  GenerationAttempt,
  LearningPlan,
  LearningPlanDetail,
  LightweightPlanSummary,
  Module,
  PlanSummary,
  Task,
  TaskProgress,
} from '@/shared/types/db.types';

export type SummaryTaskRow = {
  id: string;
  moduleId: string;
  planId: string;
  estimatedMinutes: number | null;
};

export type ProgressStatusRow = {
  taskId: string;
  status: TaskProgress['status'];
};

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
  moduleId: string;
  totalTasks: number;
  completedTasks: number;
  totalMinutes: number;
  completedMinutes: number;
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

export function mapPlanSummaries(params: {
  planRows: LearningPlan[];
  moduleRows: Module[];
  taskRows: SummaryTaskRow[];
  progressRows: ProgressStatusRow[];
}): PlanSummary[] {
  const { planRows, moduleRows, taskRows, progressRows } = params;

  const tasksByPlan = taskRows.reduce((acc, task) => {
    const existing = acc.get(task.planId) ?? [];
    acc.set(task.planId, [...existing, task]);
    return acc;
  }, new Map<string, SummaryTaskRow[]>());

  const modulesByPlan = moduleRows.reduce((acc, module) => {
    const existing = acc.get(module.planId) ?? [];
    acc.set(module.planId, [...existing, module]);
    return acc;
  }, new Map<string, Module[]>());

  const progressByTask = new Map(progressRows.map((row) => [row.taskId, row]));

  return planRows.map((plan) => {
    const tasksForPlan = tasksByPlan.get(plan.id) ?? [];
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

    const modulesForPlan = modulesByPlan.get(plan.id) ?? [];
    const completedModules = modulesForPlan.filter((module) => {
      const moduleTasks = tasksForPlan.filter(
        (task) => task.moduleId === module.id
      );
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

export function mapLightweightPlanSummaries(params: {
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

export function mapLearningPlanDetail(params: {
  plan: LearningPlan;
  moduleRows: Module[];
  taskRows: Task[];
  progressRows: TaskProgress[];
  resourceRows: TaskResourceWithResource[];
  latestAttempt: GenerationAttempt | null;
  attemptsCount: number;
}): LearningPlanDetail {
  const {
    plan,
    moduleRows,
    taskRows,
    progressRows,
    resourceRows,
    latestAttempt,
    attemptsCount,
  } = params;

  const progressByTask = new Map(progressRows.map((row) => [row.taskId, row]));

  const resourcesByTask = resourceRows.reduce((acc, row) => {
    const existing = acc.get(row.taskId) ?? [];
    acc.set(row.taskId, [...existing, row]);
    return acc;
  }, new Map<string, TaskResourceWithResource[]>());

  const tasksByModule = taskRows.reduce((acc, task) => {
    const entry = {
      ...task,
      resources: resourcesByTask.get(task.id) ?? [],
      progress: progressByTask.get(task.id) ?? null,
    };
    const existing = acc.get(task.moduleId) ?? [];
    acc.set(task.moduleId, [...existing, entry]);
    return acc;
  }, new Map<string, ModuleWithTasks['tasks']>());

  const moduleData = moduleRows.map<ModuleWithTasks>((module) => ({
    ...module,
    tasks: tasksByModule.get(module.id) ?? [],
  }));

  const totalTasks = moduleData.reduce(
    (count, module) => count + module.tasks.length,
    0
  );
  const completedTasks = moduleData.reduce(
    (count, module) =>
      count +
      module.tasks.filter((task) => task.progress?.status === 'completed')
        .length,
    0
  );

  return {
    plan: {
      ...plan,
      modules: moduleData,
    },
    totalTasks,
    completedTasks,
    latestAttempt,
    attemptsCount,
  } satisfies LearningPlanDetail;
}
