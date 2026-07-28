import type { PlanOverviewStats } from '@/app/(app)/plans/[id]/types';
import type { ClientPlanDetail } from '@/shared/types/client.types';

import { GradientProgressHeroFrame } from '@/app/(app)/plans/[id]/components/GradientProgressHeroFrame';
import { StatCell } from '@/app/(app)/plans/[id]/components/StatCell';
import { formatMinutes, formatSkillLevel } from '@/features/plans/formatters';

interface PlanOverviewProps {
  plan: ClientPlanDetail;
  stats: PlanOverviewStats;
}

/** Plan detail hero: topic, bearing, and supporting plan metrics. */
export function PlanOverviewHeader({ plan, stats }: PlanOverviewProps) {
  const {
    completedTasks,
    totalTasks,
    completionPercentage: completion,
    totalMinutes,
    estimatedWeeks,
    completedModules,
    totalModules,
    estimatedCompletionDate,
  } = stats;

  return (
    <article>
      <GradientProgressHeroFrame completion={completion}>
        <div className='grid gap-6 sm:grid-cols-[minmax(0,1fr)_9rem] sm:gap-8'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
              <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
                Learning plan
              </p>
              <p className='text-xs text-muted-foreground'>
                {formatSkillLevel(plan.skillLevel)} level
              </p>
            </div>
            <h2 className='mt-2 line-clamp-3 text-2xl font-semibold wrap-break-word text-foreground sm:line-clamp-2 md:text-3xl'>
              {plan.topic}
            </h2>
          </div>

          <div className='flex items-end justify-between gap-6 border-t border-border/50 pt-4 sm:block sm:border-t-0 sm:border-l sm:py-1 sm:pl-7 sm:text-right'>
            <div>
              <p className='text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase'>
                Progress
              </p>
              <p className='mt-1 text-4xl font-semibold text-foreground tabular-nums'>
                <span className='sr-only'>
                  Plan progress: {completion}% complete
                </span>
                <span aria-hidden='true'>
                  {completion}
                  <span className='text-xl text-muted-foreground'>%</span>
                </span>
              </p>
            </div>
            <p className='text-xs text-muted-foreground tabular-nums sm:mt-2'>
              {completedTasks} of {totalTasks} tasks complete
            </p>
          </div>
        </div>

        <dl className='mt-6 grid divide-y divide-border/40 border-t border-border/50 pt-1 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:pt-5'>
          <StatCell
            className='py-4 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0'
            label='Modules'
            value={`${completedModules} of ${totalModules}`}
            sublabel='modules complete'
          />
          <StatCell
            className='py-4 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0'
            label='Total effort'
            value={formatMinutes(totalMinutes)}
            sublabel={
              plan.weeklyHours
                ? `${plan.weeklyHours} hr${plan.weeklyHours === 1 ? '' : 's'} per week`
                : 'Weekly pace not set'
            }
          />
          <StatCell
            className='py-4 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0'
            label='Est. finish'
            value={estimatedCompletionDate ?? '—'}
            sublabel={
              estimatedWeeks
                ? `${estimatedWeeks} week${estimatedWeeks === 1 ? '' : 's'} at current pace`
                : 'Not calculated'
            }
          />
        </dl>
      </GradientProgressHeroFrame>
    </article>
  );
}
