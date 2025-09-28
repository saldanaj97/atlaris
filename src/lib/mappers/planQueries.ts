import {
  GenerationAttempt,
  LearningPlan,
  LearningPlanDetail,
  Module,
  ModuleWithTasks,
  PlanSummary,
  Task,
  TaskProgress,
  TaskResourceWithResource,
} from '@/lib/types/db';

// Narrow task row for summaries query (joined with modules to include planId)
export interface SummaryTaskRow {
  id: string;
  moduleId: string;
  planId: string;
  estimatedMinutes: number | null;
}

export interface ProgressStatusRow {
  taskId: string;
  status: TaskProgress['status'];
}

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

export function mapLearningPlanDetail(params: {
  plan: LearningPlan;
  moduleRows: Module[];
  taskRows: Task[];
  progressRows: TaskProgress[];
  resourceRows: TaskResourceWithResource[];
  attempts: GenerationAttempt[];
}): LearningPlanDetail {
  const { plan, moduleRows, taskRows, progressRows, resourceRows, attempts } =
    params;

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
    latestAttempt: attempts[0] ?? null,
    attemptsCount: attempts.length,
  } satisfies LearningPlanDetail;
}
