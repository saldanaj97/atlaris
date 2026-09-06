import type {
  ModuleDetailModule,
  ModuleDetailNavItem,
} from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { ModuleBreadcrumbNav } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleBreadcrumbNav';
import { ModuleRoundNavLink } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleRoundNavLink';
import { formatMinutes } from '@/features/plans/formatters';
import { deriveModuleCompletionSummary } from '@/features/plans/task-progress/client';
import { CheckCircle2, Clock3, ListChecks, Lock } from 'lucide-react';
import Image from 'next/image';

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

/** Module detail hero: title on the left, bearing on the right. */
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
    completedTasks,
    totalTasks,
    completionPercent: completion,
  } = deriveModuleCompletionSummary(module, statuses);
  const isModuleComplete = totalTasks > 0 && completedTasks === totalTasks;

  return (
    <article className='mb-8'>
      <ModuleBreadcrumbNav
        planId={planId}
        planTopic={planTopic}
        moduleId={module.id}
        moduleOrder={module.order}
        allModules={allModules}
        isComplete={isModuleComplete}
      />

      <div className='relative isolate min-w-0 overflow-hidden rounded-2xl border border-panel-border bg-panel shadow-sm'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
        >
          <Image
            src='/artwork/planetary-horizon-desktop.jpg'
            alt=''
            width={1672}
            height={640}
            sizes='100vw'
            className='absolute inset-0 hidden size-full object-cover object-[78%_50%] opacity-10 sm:block dark:opacity-80'
          />
          <Image
            src='/artwork/planetary-horizon-mobile.jpg'
            alt=''
            width={705}
            height={941}
            sizes='100vw'
            className='absolute inset-0 size-full object-cover object-[68%_42%] opacity-10 sm:hidden dark:opacity-75'
          />
          <div className='absolute inset-0 bg-linear-to-r from-panel via-panel/95 to-panel/35 dark:from-panel dark:via-panel/85 dark:to-panel/15' />
        </div>

        <div className='relative p-5 sm:p-6 md:p-8'>
          <div className='flex min-w-0 flex-col gap-6 sm:flex-row sm:items-end sm:justify-between'>
            <div className='max-w-3xl min-w-0'>
              <div className='flex min-w-0 items-center justify-between gap-4'>
                <p className='min-w-0 text-[11px] font-medium tracking-[0.14em] text-primary uppercase'>
                  Module {module.order} of {totalModules}
                </p>
                <div className='flex shrink-0 gap-2 sm:hidden'>
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

              <h1 className='mt-3 flex min-w-0 flex-wrap items-center gap-2 text-[28px] leading-tight font-semibold tracking-[-0.03em] text-foreground sm:text-[32px] sm:leading-[1.25]'>
                <span className='min-w-0 wrap-break-word'>{module.title}</span>
                {!previousModulesComplete && (
                  <Lock
                    aria-label='Module locked'
                    className='size-5 shrink-0 text-muted-foreground md:size-6'
                  />
                )}
                {isModuleComplete && (
                  <CheckCircle2
                    aria-label='Module completed'
                    className='size-5 shrink-0 text-success md:size-6'
                  />
                )}
              </h1>
              {module.description && (
                <p className='mt-3 max-w-2xl text-sm leading-relaxed break-words text-muted-foreground sm:text-base'>
                  {module.description}
                </p>
              )}

              <dl className='mt-5 flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground'>
                <div className='inline-flex items-center gap-2'>
                  <Clock3 aria-hidden='true' className='size-4 shrink-0' />
                  <dt className='sr-only'>Estimated time</dt>
                  <dd>{formatMinutes(module.estimatedMinutes)}</dd>
                </div>
                <div className='inline-flex items-center gap-2'>
                  <ListChecks aria-hidden='true' className='size-4 shrink-0' />
                  <dt className='sr-only'>Lessons</dt>
                  <dd>
                    {totalTasks} lesson{totalTasks === 1 ? '' : 's'}
                  </dd>
                </div>
                <div className='inline-flex items-center gap-2'>
                  <CheckCircle2
                    aria-hidden='true'
                    className='size-4 shrink-0'
                  />
                  <dt className='sr-only'>Completed lessons</dt>
                  <dd>
                    {completedTasks}/{totalTasks} complete
                  </dd>
                </div>
              </dl>
            </div>

            <div className='hidden shrink-0 items-end gap-6 sm:flex'>
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
              <div className='border-l border-border/60 pl-6 text-right'>
                <p className='text-3xl font-semibold text-foreground tabular-nums'>
                  <span className='sr-only'>
                    Module progress: {completion}% complete
                  </span>
                  <span aria-hidden='true'>
                    {completion}
                    <span className='text-lg text-muted-foreground'>%</span>
                  </span>
                </p>
                <p className='mt-1 text-xs text-muted-foreground'>complete</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
