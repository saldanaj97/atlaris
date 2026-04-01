import type {
  ModuleAccessError,
  ModuleAccessResult,
} from '@/app/plans/[id]/modules/[moduleId]/types';
import type { ModuleDetail } from '@/lib/db/queries/types/modules.types';

import { createId } from './ids';

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');

/**
 * Minimal ModuleDetail for unit tests (module detail page loaders, mappers).
 */
type ModuleDetailOverrides = Omit<
  Partial<ModuleDetail>,
  'allModules' | 'module'
> & {
  allModules?: Array<Partial<ModuleDetail['allModules'][number]>>;
  module?: Partial<ModuleDetail['module']>;
};

export function createMinimalModuleDetail(
  overrides: ModuleDetailOverrides = {}
): ModuleDetail {
  const planId = createId('plan');
  const moduleId = createId('mod');

  const base: ModuleDetail = {
    module: {
      id: moduleId,
      planId,
      order: 1,
      title: 'Test module',
      description: null,
      estimatedMinutes: 60,
      tasks: [],
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
    },
    planId,
    planTopic: 'Topic',
    totalModules: 1,
    previousModuleId: null,
    nextModuleId: null,
    previousModulesComplete: true,
    allModules: [
      { id: moduleId, order: 1, title: 'Test module', isLocked: false },
    ],
  };

  const { allModules, module, ...topLevelOverrides } = overrides;
  const resolvedPlanId = topLevelOverrides.planId ?? module?.planId ?? planId;
  const resolvedModule = {
    ...base.module,
    ...module,
    planId: resolvedPlanId,
  };
  const resolvedAllModules = allModules?.map((entry, index) => ({
    id: entry.id ?? (index === 0 ? resolvedModule.id : createId('mod')),
    isLocked: entry.isLocked ?? false,
    order: entry.order ?? index + 1,
    title:
      entry.title ??
      (index === 0 ? resolvedModule.title : `Module ${index + 1}`),
  })) ?? [
    {
      ...base.allModules[0],
      id: resolvedModule.id,
      title: resolvedModule.title,
    },
  ];

  return {
    ...base,
    ...topLevelOverrides,
    planId: resolvedPlanId,
    module: resolvedModule,
    allModules: resolvedAllModules,
  };
}

export function createSuccessModuleAccessResult(
  overrides: ModuleDetailOverrides = {}
): ModuleAccessResult {
  return {
    success: true,
    data: createMinimalModuleDetail(overrides),
  };
}

/**
 * Builds a failed ModuleAccessResult for unit tests.
 */
export function createFailedModuleAccessResult(
  errorOverrides: Partial<ModuleAccessError> = {}
): ModuleAccessResult {
  return {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'missing',
      ...errorOverrides,
    },
  };
}
