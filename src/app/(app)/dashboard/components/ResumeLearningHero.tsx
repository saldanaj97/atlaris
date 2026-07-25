import type { PlanSummary } from '@/shared/types/db.types';

import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ResumeLearningHeroProps {
  plan: PlanSummary;
}

/**
 * PlanSummary modules omit per-task progress; use completion metrics only.
 */
function getUpNextLabel(plan: PlanSummary): string {
  const progressPercent = Math.round(
    Math.max(0, Math.min(1, plan.completion)) * 100,
  );

  if (progressPercent >= 100) {
    return 'Plan complete';
  }

  return (
    plan.modules[plan.completedModules]?.title ??
    plan.modules.at(-1)?.title ??
    'Continue your current route'
  );
}

/**
 * The one chart panel on the dashboard: current plan, bearing, and a
 * hairline progress track along the bottom edge.
 */
export function ResumeLearningHero({ plan }: ResumeLearningHeroProps) {
  const clampedCompletion = Math.max(0, Math.min(1, plan.completion));
  const progressPercent = Math.round(clampedCompletion * 100);

  return (
    <article className='animate-dashboard-unfold relative h-full overflow-hidden rounded-2xl border border-panel-border bg-panel text-panel-foreground shadow-sm [--dashboard-entry-x:-0.75rem] motion-reduce:animate-none'>
      <div className='flex h-full flex-col p-6 sm:p-7'>
        <div className='flex items-start justify-between gap-4'>
          <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
            Current focus
          </p>
          <p className='text-sm font-semibold text-foreground tabular-nums'>
            {progressPercent}%
            <span className='ml-1 font-normal text-muted-foreground'>
              complete
            </span>
          </p>
        </div>

        <div className='mt-8'>
          <h2 className='text-2xl font-semibold text-balance text-foreground'>
            {plan.plan.topic}
          </h2>
          <p className='mt-2 text-sm text-muted-foreground'>
            <span className='font-medium text-foreground'>Next module</span>
            {' · '}
            {getUpNextLabel(plan)}
          </p>
        </div>

        <div className='mt-8'>
          <div
            className='h-1.5 overflow-hidden rounded-full bg-muted'
            role='progressbar'
            aria-label={`${plan.plan.topic} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div
              className='animate-dashboard-trace h-full origin-left rounded-full bg-primary [animation-delay:260ms] motion-reduce:animate-none'
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className='mt-auto pt-8'>
          <div className='flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/50 pt-4 text-xs text-muted-foreground tabular-nums'>
            <p>
              <span className='font-medium text-foreground'>
                {plan.completedTasks}/{plan.totalTasks}
              </span>{' '}
              tasks
            </p>
            <p>
              <span className='font-medium text-foreground'>
                {plan.completedModules}/{plan.modules.length}
              </span>{' '}
              modules
            </p>
          </div>

          <Button asChild className='mt-5 h-11 px-5'>
            <Link href={`/plans/${plan.plan.id}`}>Resume plan</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
