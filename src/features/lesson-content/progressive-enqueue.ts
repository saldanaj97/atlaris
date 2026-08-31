import type { DbClient } from '@/lib/db/types';

import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import { fetchModuleTaskMetricsRows } from '@/lib/db/queries/helpers/task-relations-helpers';
import { logger } from '@/lib/logging/logger';

export type OrderedModuleRef = {
  readonly id: string;
  readonly order: number;
};

export function sortModulesForProgressiveLessons<T extends OrderedModuleRef>(
  modules: readonly T[],
): T[] {
  return [...modules].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.id.localeCompare(b.id);
  });
}

export function selectFirstProgressiveLessonModuleIds(
  modules: readonly OrderedModuleRef[],
): string[] {
  return sortModulesForProgressiveLessons(modules)
    .slice(0, 2)
    .map((module) => module.id);
}

export function selectProgressiveFollowUpModuleId(
  modules: readonly OrderedModuleRef[],
  currentModuleId: string,
): string | null {
  const sorted = sortModulesForProgressiveLessons(modules);
  const index = sorted.findIndex((module) => module.id === currentModuleId);
  if (index < 0) {
    return null;
  }
  return sorted[index + 2]?.id ?? null;
}

export function isProgressiveLessonThresholdMet(
  completedTasks: number,
  totalTasks: number,
): boolean {
  if (totalTasks <= 0) {
    return false;
  }
  return completedTasks >= Math.ceil(totalTasks / 2);
}

export type EnqueueModuleLessonGenerationsParams = {
  readonly dbClient: DbClient;
  readonly userId: string;
  readonly planId: string;
  readonly moduleIds: readonly string[];
  readonly correlationId: string;
};

export type EnqueueModuleLessonGenerationsDeps = {
  readonly start?: typeof startModuleLessonGeneration;
};

export async function enqueueModuleLessonGenerations(
  params: EnqueueModuleLessonGenerationsParams,
  deps: EnqueueModuleLessonGenerationsDeps = {},
): Promise<void> {
  const startGeneration = deps.start ?? startModuleLessonGeneration;
  for (const moduleId of params.moduleIds) {
    try {
      const result = await startGeneration({
        dbClient: params.dbClient,
        userId: params.userId,
        planId: params.planId,
        moduleId,
        correlationId: params.correlationId,
      });
      switch (result.kind) {
        case 'workflow_started':
        case 'in_flight':
        case 'already_ready':
        case 'success':
          break;
        case 'disabled':
        case 'failed':
        case 'workflow_start_failed':
        case 'not_found':
        case 'locked':
          logger.warn(
            {
              planId: params.planId,
              moduleId,
              userId: params.userId,
              state: result.kind,
            },
            'Progressive lesson enqueue did not start generation',
          );
          break;
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
    } catch (error) {
      logger.warn(
        {
          err: error,
          planId: params.planId,
          moduleId,
          userId: params.userId,
        },
        'Progressive lesson enqueue failed',
      );
    }
  }
}

type ProgressiveEnqueueContext = {
  readonly dbClient: DbClient;
  readonly userId: string;
  readonly planId: string;
  readonly correlationId: string;
};

async function loadOrderedPlanModules(
  dbClient: DbClient,
  planId: string,
  userId: string,
): Promise<
  readonly (OrderedModuleRef & {
    readonly completedTasks: number;
    readonly totalTasks: number;
  })[]
> {
  const rows = await fetchModuleTaskMetricsRows({
    planIds: [planId],
    userId,
    dbClient,
  });
  return sortModulesForProgressiveLessons(
    rows.map((row) => ({
      id: row.moduleId,
      order: row.moduleOrder,
      completedTasks: Number(row.completedTasks),
      totalTasks: Number(row.totalTasks),
    })),
  );
}

export async function enqueueFirstProgressiveModuleLessons(
  params: ProgressiveEnqueueContext,
  deps: EnqueueModuleLessonGenerationsDeps = {},
): Promise<void> {
  const modules = await loadOrderedPlanModules(
    params.dbClient,
    params.planId,
    params.userId,
  );
  await enqueueModuleLessonGenerations(
    {
      ...params,
      moduleIds: selectFirstProgressiveLessonModuleIds(modules),
    },
    deps,
  );
}

export async function enqueueFollowUpLessonsAfterProgress(
  params: ProgressiveEnqueueContext & {
    readonly moduleId?: string;
  },
  deps: EnqueueModuleLessonGenerationsDeps = {},
): Promise<void> {
  const modules = await loadOrderedPlanModules(
    params.dbClient,
    params.planId,
    params.userId,
  );
  const followUpIds = new Set<string>();
  for (const module of modules) {
    if (params.moduleId !== undefined && module.id !== params.moduleId) {
      continue;
    }
    if (
      !isProgressiveLessonThresholdMet(module.completedTasks, module.totalTasks)
    ) {
      continue;
    }
    const followUpId = selectProgressiveFollowUpModuleId(modules, module.id);
    if (followUpId) {
      followUpIds.add(followUpId);
    }
  }
  await enqueueModuleLessonGenerations(
    {
      ...params,
      moduleIds: [...followUpIds],
    },
    deps,
  );
}
