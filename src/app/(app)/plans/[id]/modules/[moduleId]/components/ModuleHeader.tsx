import type {
  ModuleDetailModule,
  ModuleDetailNavItem,
} from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { ModuleBreadcrumbNav } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleBreadcrumbNav';
import { ModuleRoundNavLink } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleRoundNavLink';
import { PageHero } from '@/components/ui/page-hero';
import { formatMinutes } from '@/features/plans/formatters';
import { deriveModuleCompletionSummary } from '@/features/plans/task-progress/client';
import { CheckCircle2, Clock3, ListChecks, Lock } from 'lucide-react';

interface ModuleHeaderProps {
  module: ModuleDetailModule;
  planId: string;
  planTopic: string;
  previousModuleId: string | null;
  nextModuleId: string | null;
  statuses: Record<string, ProgressStatus>;
  previousModulesComplete: boolean;
  allModules: ModuleDetailNavItem[];
}

/** Module detail hero: title, description, and real module meta. */
export function ModuleHeader({
  module,
  planId,
  planTopic,
  previousModuleId,
  nextModuleId,
  statuses,
  previousModulesComplete,
  allModules,
}: ModuleHeaderProps) {
  const { completedTasks, totalTasks } = deriveModuleCompletionSummary(
    module,
    statuses,
  );
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

      <PageHero
        as='div'
        className='min-w-0 rounded-lg border border-panel-border bg-panel shadow-sm'
        desktop={{ className: 'opacity-80 sm:block' }}
        mobile={{ className: 'opacity-75 sm:hidden' }}
      >
        <div className='relative p-5 sm:p-6'>
          <div className='flex min-w-0 items-start justify-between gap-4'>
            <h1 className='flex min-w-0 flex-wrap items-center gap-2 type-title text-foreground'>
              <span className='min-w-0 wrap-break-word'>{module.title}</span>
              {!previousModulesComplete && (
                <>
                  <Lock
                    aria-hidden='true'
                    className='size-5 shrink-0 text-muted-foreground'
                  />
                  <span className='sr-only'>Module locked</span>
                </>
              )}
              {isModuleComplete && (
                <>
                  <CheckCircle2
                    aria-hidden='true'
                    className='size-5 shrink-0 text-success'
                  />
                  <span className='sr-only'>Module completed</span>
                </>
              )}
            </h1>
            <div className='flex shrink-0 gap-2'>
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
          {module.description ? (
            <p className='mt-3 max-w-[70ch] type-reading wrap-break-word text-muted-foreground'>
              {module.description}
            </p>
          ) : null}

          <dl className='mt-4 flex min-w-0 flex-wrap gap-x-5 gap-y-2 type-meta text-muted-foreground'>
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
              <CheckCircle2 aria-hidden='true' className='size-4 shrink-0' />
              <dt className='sr-only'>Completed lessons</dt>
              <dd>
                {completedTasks}/{totalTasks} complete
              </dd>
            </div>
          </dl>
        </div>
      </PageHero>
    </article>
  );
}
