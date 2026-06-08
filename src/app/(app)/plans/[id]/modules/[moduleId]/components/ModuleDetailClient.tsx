'use client';

import type { ModuleDetailReadModel } from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { useOptimisticTaskStatusUpdates } from '@/app/(app)/plans/[id]/hooks/useOptimisticTaskStatusUpdates';
import { batchUpdateModuleTaskProgressAction } from '@/app/(app)/plans/[id]/modules/[moduleId]/actions';
import { ModuleHeader } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleHeader';
import { ModuleLessonsClient } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleLessonsClient';
import { clientLogger } from '@/lib/logging/client';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface ModuleDetailClientProps {
  moduleData: ModuleDetailReadModel;
  initialStatuses: Record<string, ProgressStatus>;
}

export function ModuleDetailClient({
  moduleData,
  initialStatuses,
}: ModuleDetailClientProps) {
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
  const scopedTaskIds = new Set(lessons.map((lesson) => lesson.id));

  const flushModuleTaskProgress = useCallback(
    async (updates: Array<{ taskId: string; status: ProgressStatus }>) => {
      const result = await batchUpdateModuleTaskProgressAction({
        planId,
        moduleId: module.id,
        updates,
      });
      if (result?.revalidateFailed) {
        toast.message('Progress saved. Refresh if the page looks stale.');
      }
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
    scopedTaskIds,
    flushAction: flushModuleTaskProgress,
    onError: handleTaskStatusError,
  });

  return (
    <div className='space-y-8'>
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
        moduleId={module.id}
        lessons={lessons}
        lessonGeneration={module.lessonGeneration}
        nextModuleId={nextModuleId}
        previousModulesComplete={previousModulesComplete}
        statuses={statuses}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
