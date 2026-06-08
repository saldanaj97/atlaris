import type { PlanOverviewStats } from '@/app/(app)/plans/[id]/types';
import type { ClientPlanDetail } from '@/shared/types/client.types';

import { GradientProgressHeroFrame } from '@/app/(app)/plans/[id]/components/GradientProgressHeroFrame';
import { MetricCard } from '@/components/ui/metric-card';
import { formatMinutes, formatSkillLevel } from '@/features/plans/formatters';
import { BookOpen, Calendar, Clock, TrendingUp } from 'lucide-react';

interface PlanOverviewProps {
  plan: ClientPlanDetail;
  stats: PlanOverviewStats;
}

/** Plan detail hero: topic, tags, progress, and overview metrics. */
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
    tags,
  } = stats;

  return (
    <article className='lg:col-span-2'>
      <GradientProgressHeroFrame
        className='mb-6'
        contentClassName='min-h-88'
        completion={completion}
      >
        <div className='flex items-start justify-between'>
          <div className='flex flex-wrap gap-2'>
            {tags.map((tag) => (
              <span
                key={tag}
                className='rounded-full border border-border/60 bg-muted px-3 py-1 text-xs font-medium text-muted-foreground'
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className='min-w-0'>
          <p className='mb-2 text-sm font-medium tracking-wider text-muted-foreground uppercase'>
            Learning Plan
          </p>
          <h2 className='mb-1 truncate text-3xl font-bold text-foreground md:text-4xl lg:text-5xl'>
            {plan.topic}
          </h2>
          <p className='text-lg text-muted-foreground md:text-xl'>
            {formatSkillLevel(plan.skillLevel)} • {formatMinutes(totalMinutes)}{' '}
            total
          </p>
        </div>
      </GradientProgressHeroFrame>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <MetricCard
          icon={<BookOpen />}
          label='Modules'
          value={`${completedModules}/${totalModules}`}
          sublabel='Completed'
        />
        <MetricCard
          icon={<Clock />}
          label='Progress'
          value={`${completion}%`}
          sublabel={`${completedTasks}/${totalTasks} tasks`}
        />
        <MetricCard
          icon={<TrendingUp />}
          label='Total Effort'
          value={formatMinutes(totalMinutes)}
          sublabel={plan.weeklyHours ? `${plan.weeklyHours}h/week` : '—'}
        />
        <MetricCard
          icon={<Calendar />}
          label='Est. Finish'
          value={estimatedCompletionDate ?? '—'}
          sublabel={
            estimatedWeeks
              ? `${estimatedWeeks} week${estimatedWeeks === 1 ? '' : 's'}`
              : 'Not calculated'
          }
        />
      </div>
    </article>
  );
}
