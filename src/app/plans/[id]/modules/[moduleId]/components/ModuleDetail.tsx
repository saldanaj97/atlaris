import type { ModuleDetail as ModuleDetailData } from '@/lib/db/queries/types/modules.types';
import type { ProgressStatus } from '@/lib/types/db';
import { ModuleLessonsClient } from './ModuleLessonsClient';
import { ModuleHeader } from './ModuleHeader';

interface ModuleDetailProps {
  moduleData: ModuleDetailData;
}

/**
 * Server-rendered module detail shell.
 * Keeps the header static on the server and delegates lesson interactions to a client island.
 */
export function ModuleDetail({ moduleData }: ModuleDetailProps) {
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
  const initialStatuses: Record<string, ProgressStatus> = Object.fromEntries(
    lessons.map((lesson) => [
      lesson.id,
      lesson.progress?.status ?? 'not_started',
    ])
  );

  return (
    <div className="space-y-8">
      {/* Module Header with Glassmorphism */}
      <ModuleHeader
        module={module}
        planId={planId}
        planTopic={planTopic}
        totalModules={totalModules}
        previousModuleId={previousModuleId}
        nextModuleId={nextModuleId}
        statuses={initialStatuses}
        previousModulesComplete={previousModulesComplete}
        allModules={allModules}
      />

      <ModuleLessonsClient
        planId={planId}
        moduleId={module.id}
        lessons={lessons}
        nextModuleId={nextModuleId}
        previousModulesComplete={previousModulesComplete}
        initialStatuses={initialStatuses}
      />
    </div>
  );
}
