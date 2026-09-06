import type { PlanSummary } from '@/shared/types/db.types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { planDetailPath } from '@/features/navigation/routes';
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
    <Card
      as='article'
      className='relative h-full overflow-hidden p-6 animate-dashboard-unfold [--dashboard-entry-x:-0.75rem] motion-reduce:animate-none sm:p-7'
    >
      <div className='flex h-full flex-col'>
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
          <Progress
            value={progressPercent}
            max={100}
            aria-label={`${plan.plan.topic} progress`}
            className='h-1.5'
          />
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
            <Link href={planDetailPath(plan.plan.id)}>Resume plan</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
