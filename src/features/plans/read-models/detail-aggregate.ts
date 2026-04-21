import { computeCompletionMetricsFromNestedModules } from '@/features/plans/read-models/completion-metrics';
import type { TaskResourceWithResource } from '@/lib/db/queries/types/modules.types';
import type {
  GenerationAttempt,
  LearningPlan,
  LearningPlanDetail,
  Module,
  Task,
  TaskProgress,
} from '@/shared/types/db.types';

type ModuleTasks = LearningPlanDetail['plan']['modules'][number]['tasks'];

export function buildLearningPlanDetail(params: {
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
    existing.push(row);
    acc.set(row.taskId, existing);
    return acc;
  }, new Map<string, TaskResourceWithResource[]>());

  const tasksByModule = taskRows.reduce((acc, task) => {
    const existing = acc.get(task.moduleId) ?? [];
    existing.push({
      ...task,
      resources: (resourcesByTask.get(task.id) ?? []).toSorted(
        (a, b) => a.order - b.order
      ),
      progress: progressByTask.get(task.id) ?? null,
    });
    acc.set(task.moduleId, existing);
    return acc;
  }, new Map<string, ModuleTasks>());

  const modules = moduleRows
    .toSorted((a, b) => a.order - b.order)
    .map((planModule) => ({
      ...planModule,
      tasks: (tasksByModule.get(planModule.id) ?? []).toSorted(
        (a, b) => a.order - b.order
      ),
    }));

  const {
    totalTasks,
    completedTasks,
    totalMinutes,
    completedMinutes,
    completedModules,
  } = computeCompletionMetricsFromNestedModules(modules);

  return {
    plan: {
      ...plan,
      modules,
    },
    totalTasks,
    completedTasks,
    totalMinutes,
    completedMinutes,
    completedModules,
    latestAttempt,
    attemptsCount,
  } satisfies LearningPlanDetail;
}
