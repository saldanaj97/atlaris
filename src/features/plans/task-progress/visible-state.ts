import { formatSkillLevel } from '@/features/plans/formatters';
import type {
  ClientModule,
  ClientPlanDetail,
} from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

import type {
  ModuleCompletionSummary,
  PlanDetailsCardStats,
  PlanModuleTimelineStatus,
  PlanOverviewStats,
} from './types';

const DEFAULT_PROGRESS_STATUS: ProgressStatus = 'not_started';

function getTaskStatus(
  statuses: Record<string, ProgressStatus>,
  task: { id: string; status?: ProgressStatus },
): ProgressStatus {
  return statuses[task.id] ?? task.status ?? DEFAULT_PROGRESS_STATUS;
}

function getTaskProgressStatus(
  statuses: Record<string, ProgressStatus>,
  task: {
    id: string;
    status?: ProgressStatus;
    progress?: { status: ProgressStatus } | null;
  },
): ProgressStatus {
  return (
    statuses[task.id] ??
    task.status ??
    task.progress?.status ??
    DEFAULT_PROGRESS_STATUS
  );
}

type LessonProgressSource = {
  id: string;
  status?: ProgressStatus;
  progress?: { status: ProgressStatus } | null;
};

type ModuleCompletionSource = {
  tasks: Array<{
    id: string;
    estimatedMinutes: number | null;
    status?: ProgressStatus;
    progress?: { status: ProgressStatus } | null;
  }>;
};

export function buildTaskStatusMap(
  modules: ClientModule[],
): Record<string, ProgressStatus> {
  return Object.fromEntries(
    modules.flatMap((mod) =>
      mod.tasks.map((task) => [task.id, task.status] as const),
    ),
  );
}

function computeSharedPlanStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>,
) {
  const completedTasks = plan.modules.reduce(
    (count, module) =>
      count +
      module.tasks.filter(
        (task) => getTaskStatus(statuses, task) === 'completed',
      ).length,
    0,
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

function computeEstimatedCompletionDate(
  estimatedWeeks: number | null,
): string | null {
  if (estimatedWeeks == null) return null;
  const date = new Date();
  date.setDate(date.getDate() + estimatedWeeks * 7);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function computeTags(
  plan: ClientPlanDetail,
  modules: ClientModule[],
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

export function derivePlanOverviewStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>,
): PlanOverviewStats {
  const modules = plan.modules;
  const sharedStats = computeSharedPlanStats(plan, statuses);

  const completedModules = modules.filter((mod) => {
    const moduleTasks = mod.tasks;
    if (moduleTasks.length === 0) return false;
    return moduleTasks.every(
      (task) => getTaskStatus(statuses, task) === 'completed',
    );
  }).length;

  const estimatedCompletionDate = computeEstimatedCompletionDate(
    sharedStats.estimatedWeeks,
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

export function derivePlanDetailsCardStats(
  plan: ClientPlanDetail,
  statuses: Record<string, ProgressStatus>,
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

export function deriveModuleProgressState(
  mod: ClientModule,
  statuses: Record<string, ProgressStatus>,
  previousModulesCompleted: boolean,
): PlanModuleTimelineStatus {
  const tasks = mod.tasks;
  if (tasks.length === 0) return previousModulesCompleted ? 'active' : 'locked';

  const taskStatuses = tasks.map((task) => getTaskStatus(statuses, task));
  const allCompleted = taskStatuses.every((status) => status === 'completed');
  const hasInProgress = taskStatuses.some((status) => status === 'in_progress');

  if (allCompleted) return 'completed';
  if (hasInProgress || previousModulesCompleted) return 'active';
  return 'locked';
}

export function deriveActiveModuleId(
  modules: ClientModule[],
  statuses: Record<string, ProgressStatus>,
): string | null {
  let previousModulesCompleted = true;

  for (const mod of modules) {
    const status = deriveModuleProgressState(
      mod,
      statuses,
      previousModulesCompleted,
    );
    if (status === 'active') {
      return mod.id;
    }

    const tasks = mod.tasks;
    previousModulesCompleted = tasks.every(
      (task) => getTaskStatus(statuses, task) === 'completed',
    );
  }

  return null;
}

export function deriveCompletedModuleIds(
  modules: ClientModule[],
  statuses: Record<string, ProgressStatus>,
): Set<string> {
  return new Set(
    modules
      .filter((module) => {
        const tasks = module.tasks;
        return (
          tasks.length > 0 &&
          tasks.every((task) => getTaskStatus(statuses, task) === 'completed')
        );
      })
      .map((module) => module.id),
  );
}

export function deriveLessonLocks(
  lessons: LessonProgressSource[],
  statuses: Record<string, ProgressStatus>,
  previousModulesComplete: boolean,
): boolean[] {
  return computeLessonLocks(lessons, statuses, previousModulesComplete);
}

export function deriveLessonState(
  lessons: LessonProgressSource[],
  statuses: Record<string, ProgressStatus>,
  previousModulesComplete: boolean,
): {
  locks: boolean[];
  firstUnlockedIncompleteLessonId: string | undefined;
} {
  const locks = computeLessonLocks(lessons, statuses, previousModulesComplete);
  for (let index = 0; index < lessons.length; index++) {
    const lesson = lessons[index];
    if (
      !locks[index] &&
      getTaskProgressStatus(statuses, lesson) !== 'completed'
    ) {
      return { locks, firstUnlockedIncompleteLessonId: lesson.id };
    }
  }
  return { locks, firstUnlockedIncompleteLessonId: undefined };
}

function computeLessonLocks(
  lessons: LessonProgressSource[],
  statuses: Record<string, ProgressStatus>,
  previousModulesComplete: boolean,
): boolean[] {
  return lessons.map((_, lessonIndex) =>
    isLessonLockedAtIndex(
      lessonIndex,
      statuses,
      lessons,
      previousModulesComplete,
    ),
  );
}

function isLessonLockedAtIndex(
  lessonIndex: number,
  statuses: Record<string, ProgressStatus>,
  lessons: LessonProgressSource[],
  previousModulesComplete: boolean,
): boolean {
  if (!previousModulesComplete) {
    return true;
  }

  if (lessonIndex === 0) {
    return false;
  }

  for (let index = 0; index < lessonIndex; index++) {
    const previousLesson = lessons[index];
    if (getTaskProgressStatus(statuses, previousLesson) !== 'completed') {
      return true;
    }
  }

  return false;
}

export function deriveFirstUnlockedIncompleteLessonId(
  lessons: LessonProgressSource[],
  statuses: Record<string, ProgressStatus>,
  previousModulesComplete: boolean,
): string | undefined {
  return deriveLessonState(lessons, statuses, previousModulesComplete)
    .firstUnlockedIncompleteLessonId;
}

export function deriveModuleCompletionSummary(
  module: ModuleCompletionSource,
  statuses: Record<string, ProgressStatus>,
): ModuleCompletionSummary {
  const tasks = module.tasks;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(
    (task) => getTaskProgressStatus(statuses, task) === 'completed',
  ).length;
  const totalMinutes = tasks.reduce(
    (sum, task) => sum + (task.estimatedMinutes ?? 0),
    0,
  );
  const completionPercent =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    totalTasks,
    completedTasks,
    totalMinutes,
    completionPercent,
  };
}
