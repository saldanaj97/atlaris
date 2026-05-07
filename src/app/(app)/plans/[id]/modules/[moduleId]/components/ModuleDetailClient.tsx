'use client';

import { type JSX, useCallback } from 'react';

import { batchUpdateModuleTaskProgressAction } from '@/app/(app)/plans/[id]/modules/[moduleId]/actions';
import { ModuleHeader } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleHeader';
import { ModuleLessonsClient } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleLessonsClient';
import { useOptimisticTaskStatusUpdates } from '@/app/(app)/plans/[id]/hooks/useOptimisticTaskStatusUpdates';
import type { ModuleDetailReadModel } from '@/features/plans/read-projection/types';
import { clientLogger } from '@/lib/logging/client';
import type { ProgressStatus } from '@/shared/types/db.types';

interface ModuleDetailClientProps {
  moduleData: ModuleDetailReadModel;
  initialStatuses: Record<string, ProgressStatus>;
}

export function ModuleDetailClient({
  moduleData,
  initialStatuses,
}: ModuleDetailClientProps): JSX.Element {
  const {
    module,
    planId,
    planTopic,
    totalModules,
    previousModuleId,
    nextModuleId,
    previousModulesComplete,
    allModules,
  } = moduleData;

  const lessons = module.tasks;

  const flushModuleTaskProgress = useCallback(
    async (updates: Array<{ taskId: string; status: ProgressStatus }>) => {
      await batchUpdateModuleTaskProgressAction({
        planId,
        moduleId: module.id,
        updates,
      });
    },
    [module.id, planId],
  );

  const handleTaskStatusError = useCallback(
    ({ error, taskId }: { error: unknown; taskId: string }) => {
      clientLogger.error('Module task status batch failed', {
        error,
        moduleId: module.id,
        planId,
        taskId,
      });
    },
    [module.id, planId],
  );

  const { statuses, handleStatusChange } = useOptimisticTaskStatusUpdates({
    initialStatuses,
    flushAction: flushModuleTaskProgress,
    onError: handleTaskStatusError,
  });

  return (
    <div className="space-y-8">
      <ModuleHeader
        module={module}
        planId={planId}
        planTopic={planTopic}
        totalModules={totalModules}
        previousModuleId={previousModuleId}
        nextModuleId={nextModuleId}
        statuses={statuses}
        previousModulesComplete={previousModulesComplete}
        allModules={allModules}
      />

      <ModuleLessonsClient
        planId={planId}
        lessons={lessons}
        nextModuleId={nextModuleId}
        previousModulesComplete={previousModulesComplete}
        statuses={statuses}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
