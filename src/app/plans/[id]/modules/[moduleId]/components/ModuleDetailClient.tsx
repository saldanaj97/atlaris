'use client';

import { useState, type JSX } from 'react';

import { ModuleHeader } from '@/app/plans/[id]/modules/[moduleId]/components/ModuleHeader';
import { ModuleLessonsClient } from '@/app/plans/[id]/modules/[moduleId]/components/ModuleLessonsClient';
import type { ModuleDetail as ModuleDetailData } from '@/lib/db/queries/types/modules.types';
import type { ProgressStatus } from '@/lib/types/db';

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
  const [statuses, setStatuses] =
    useState<Record<string, ProgressStatus>>(initialStatuses);

  const handleStatusChange = (taskId: string, nextStatus: ProgressStatus) => {
    setStatuses((previousStatuses) => {
      if (previousStatuses[taskId] === nextStatus) {
        return previousStatuses;
      }

      return {
        ...previousStatuses,
        [taskId]: nextStatus,
      };
    });
  };

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
        moduleId={module.id}
        lessons={lessons}
        nextModuleId={nextModuleId}
        previousModulesComplete={previousModulesComplete}
        statuses={statuses}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
