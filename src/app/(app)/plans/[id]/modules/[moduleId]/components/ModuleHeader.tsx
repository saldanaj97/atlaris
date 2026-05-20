import { CheckCircle2, Lock } from 'lucide-react';
import type { JSX } from 'react';

import { GradientProgressHeroFrame } from '@/app/(app)/plans/[id]/components/GradientProgressHeroFrame';
import { ModuleBreadcrumbNav } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleBreadcrumbNav';
import { ModuleRoundNavLink } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleRoundNavLink';
import { ModuleStatsGrid } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleStatsGrid';
import type {
  ModuleDetailModule,
  ModuleDetailNavItem,
} from '@/features/plans/read-projection/types';
import { deriveModuleCompletionSummary } from '@/features/plans/task-progress/client';
import type { ProgressStatus } from '@/shared/types/db.types';

interface ModuleHeaderProps {
  module: ModuleDetailModule;
  planId: string;
  planTopic: string;
  totalModules: number;
  previousModuleId: string | null;
  nextModuleId: string | null;
  statuses: Record<string, ProgressStatus>;
  previousModulesComplete: boolean;
  allModules: ModuleDetailNavItem[];
}

/** Brand-only gradients (primary / accent / primary-dark) for visual variety */
const MODULE_GRADIENTS = [
  'from-primary via-accent to-primary-dark',
  'from-primary-dark via-primary to-accent',
  'from-accent via-primary to-primary-dark',
  'from-primary via-primary-dark to-accent',
  'from-chart-2 via-primary to-accent',
];

/**
 * Module detail hero header.
 * Displays module title, progress stats, and navigation between modules.
 */
export function ModuleHeader({
  module,
  planId,
  planTopic,
  totalModules,
  previousModuleId,
  nextModuleId,
  statuses,
  previousModulesComplete,
  allModules,
}: ModuleHeaderProps): JSX.Element {
  const {
    totalTasks,
    completedTasks,
    totalMinutes,
    completionPercent: completion,
  } = deriveModuleCompletionSummary(module, statuses);

  const gradient =
    MODULE_GRADIENTS[(module.order - 1) % MODULE_GRADIENTS.length];

  return (
    <article className="mb-8">
      <ModuleBreadcrumbNav
        planId={planId}
        planTopic={planTopic}
        moduleId={module.id}
        moduleOrder={module.order}
        allModules={allModules}
      />

      <GradientProgressHeroFrame
        className="shadow-primary/20"
        contentClassName="min-h-62"
        gradientClassName={gradient}
        completion={completion}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-medium text-white">
              Module {module.order} of {totalModules}
            </span>
          </div>

          <div className="flex gap-2">
            <ModuleRoundNavLink
              planId={planId}
              targetModuleId={previousModuleId}
              direction="previous"
            />
            <ModuleRoundNavLink
              planId={planId}
              targetModuleId={nextModuleId}
              direction="next"
            />
          </div>
        </div>

        <div>
          <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold text-white md:text-4xl">
            {module.title}
            {!previousModulesComplete && (
              <Lock className="h-6 w-6 text-white/50 md:h-7 md:w-7" />
            )}
            {completion === 100 && (
              <CheckCircle2 className="h-6 w-6 text-white drop-shadow-md md:h-7 md:w-7" />
            )}
          </h1>
          {module.description && (
            <p className="max-w-2xl text-lg text-white/80">
              {module.description}
            </p>
          )}
        </div>
      </GradientProgressHeroFrame>

      <ModuleStatsGrid
        completedTasks={completedTasks}
        totalTasks={totalTasks}
        totalMinutes={totalMinutes}
        estimatedMinutes={module.estimatedMinutes}
        completion={completion}
      />
    </article>
  );
}
