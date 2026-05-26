import type {
  ModuleDetailModule,
  ModuleDetailNavItem,
} from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';
import type { JSX } from 'react';

import { GradientProgressHeroFrame } from '@/app/(app)/plans/[id]/components/GradientProgressHeroFrame';
import { ModuleBreadcrumbNav } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleBreadcrumbNav';
import { ModuleRoundNavLink } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleRoundNavLink';
import { ModuleStatsGrid } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleStatsGrid';
import { deriveModuleCompletionSummary } from '@/features/plans/task-progress/client';
import { CheckCircle2, Lock } from 'lucide-react';

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

/** Module detail hero: title, progress, and round navigation. */
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

  return (
    <article className='mb-8'>
      <ModuleBreadcrumbNav
        planId={planId}
        planTopic={planTopic}
        moduleId={module.id}
        moduleOrder={module.order}
        allModules={allModules}
      />

      <GradientProgressHeroFrame
        contentClassName='min-h-62'
        completion={completion}
      >
        <div className='flex items-start justify-between'>
          <div className='flex flex-wrap gap-2'>
            <span className='rounded-full border border-border/60 bg-muted px-3 py-1 text-xs font-medium text-muted-foreground'>
              Module {module.order} of {totalModules}
            </span>
          </div>

          <div className='flex gap-2'>
            <ModuleRoundNavLink
              planId={planId}
              targetModuleId={previousModuleId}
              direction='previous'
            />
            <ModuleRoundNavLink
              planId={planId}
              targetModuleId={nextModuleId}
              direction='next'
            />
          </div>
        </div>

        <div>
          <h1 className='mb-2 flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl lg:text-4xl'>
            {module.title}
            {!previousModulesComplete && (
              <Lock className='h-6 w-6 text-muted-foreground md:h-7 md:w-7' />
            )}
            {completion === 100 && (
              <CheckCircle2 className='h-6 w-6 text-success md:h-7 md:w-7' />
            )}
          </h1>
          {module.description && (
            <p className='max-w-2xl text-base text-muted-foreground md:text-lg'>
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
