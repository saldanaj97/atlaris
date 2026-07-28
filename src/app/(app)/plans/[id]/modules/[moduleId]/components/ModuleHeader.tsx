import type {
  ModuleDetailModule,
  ModuleDetailNavItem,
} from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

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

/** Module detail hero: title on the left, bearing on the right, stats strip below. */
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
}: ModuleHeaderProps) {
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

      <GradientProgressHeroFrame completion={completion}>
        <div className='flex flex-col gap-6 sm:flex-row sm:items-stretch sm:justify-between'>
          <div className='min-w-0'>
            <div className='flex items-center justify-between gap-4'>
              <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
                Module {module.order} of {totalModules}
              </p>
              <div className='flex gap-2 sm:hidden'>
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

            <h1 className='mt-3 flex min-w-0 flex-wrap items-center gap-2 text-2xl font-semibold text-foreground md:text-3xl'>
              <span className='line-clamp-3 min-w-0 wrap-break-word sm:line-clamp-2'>
                {module.title}
              </span>
              {!previousModulesComplete && (
                <Lock className='size-5 text-muted-foreground md:size-6' />
              )}
              {completion === 100 && (
                <CheckCircle2 className='size-5 text-success md:size-6' />
              )}
            </h1>
            {module.description && (
              <p className='mt-2 max-w-2xl text-sm text-muted-foreground md:text-base'>
                {module.description}
              </p>
            )}
          </div>

          <div className='hidden shrink-0 flex-col items-end justify-between gap-6 border-l border-border/50 py-1 pl-7 sm:flex'>
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
            <div className='text-right'>
              <p className='text-4xl font-semibold text-foreground tabular-nums'>
                <span className='sr-only'>
                  Module progress: {completion}% complete
                </span>
                <span aria-hidden='true'>
                  {completion}
                  <span className='text-xl text-muted-foreground'>%</span>
                </span>
              </p>
              <p
                aria-hidden='true'
                className='mt-1 text-xs text-muted-foreground'
              >
                complete
              </p>
            </div>
          </div>
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
