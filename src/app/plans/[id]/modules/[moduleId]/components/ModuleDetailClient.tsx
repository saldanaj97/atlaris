'use client';

import {
  useCallback,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useTransition,
  type JSX,
} from 'react';

import { batchUpdateModuleTaskProgressAction } from '@/app/plans/[id]/modules/[moduleId]/actions';
import { ModuleHeader } from '@/app/plans/[id]/modules/[moduleId]/components/ModuleHeader';
import { ModuleLessonsClient } from '@/app/plans/[id]/modules/[moduleId]/components/ModuleLessonsClient';
import { useTaskStatusBatcher } from '@/hooks/useTaskStatusBatcher';
import type { ModuleDetail as ModuleDetailData } from '@/lib/db/queries/types/modules.types';
import { clientLogger } from '@/lib/logging/client';
import type { ProgressStatus } from '@/lib/types/db.types';

interface ModuleDetailClientProps {
  moduleData: ModuleDetailData;
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

  const lessons = module.tasks ?? [];
  const [statuses, addOptimisticStatus] = useOptimistic(
    initialStatuses,
    (
      current: Record<string, ProgressStatus>,
      update: { taskId: string; status: ProgressStatus }
    ) => ({
      ...current,
      [update.taskId]: update.status,
    })
  );

  // Ref mirrors optimistic state so handleStatusChange reads the latest value
  // without adding `statuses` to its dependency array (avoids callback churn).
  const statusesRef = useRef(statuses);

  useLayoutEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  const [_isPending, startTransition] = useTransition();

  const batcher = useTaskStatusBatcher({
    flushAction: async (updates) => {
      await batchUpdateModuleTaskProgressAction({
        planId,
        moduleId: module.id,
        updates,
      });
    },
  });

  const handleStatusChange = useCallback(
    (taskId: string, nextStatus: ProgressStatus) => {
      const previousStatus = statusesRef.current[taskId] ?? 'not_started';

      startTransition(async () => {
        addOptimisticStatus({ taskId, status: nextStatus });
        try {
          await batcher.queue(taskId, nextStatus, previousStatus);
        } catch (error: unknown) {
          clientLogger.error('Module task status batch failed', {
            error,
            moduleId: module.id,
            planId,
            taskId,
          });
          // Transition settling auto-reverts optimistic state.
          // Toast is shown by the batcher.
        }
      });
    },
    [addOptimisticStatus, batcher, module.id, planId]
  );

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
