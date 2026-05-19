import { BookOpen, Calendar, Clock, TrendingUp } from 'lucide-react';
import { GradientProgressHeroFrame } from '@/app/(app)/plans/[id]/components/GradientProgressHeroFrame';
import type { PlanOverviewStats } from '@/app/(app)/plans/[id]/types';
import { MetricCard } from '@/components/ui/metric-card';
import { formatMinutes, formatSkillLevel } from '@/features/plans/formatters';
import type { ClientPlanDetail } from '@/shared/types/client.types';

interface PlanOverviewProps {
  plan: ClientPlanDetail;
  stats: PlanOverviewStats;
}

// Gradient presets based on skill level for visual variety
const SKILL_GRADIENTS: Record<string, string> = {
  beginner: 'from-emerald-600 via-teal-500 to-cyan-500',
  intermediate: 'from-primary via-accent to-rose-500',
  advanced: 'from-amber-600 via-orange-500 to-red-500',
};

/**
 * Magazine-style hero overview card for a learning plan.
 * Displays plan title, progress stats, and quick actions in an editorial layout.
 */
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

  const gradient =
    SKILL_GRADIENTS[plan.skillLevel] ?? SKILL_GRADIENTS.intermediate;

  return (
    <article className="lg:col-span-2">
      {/* Cover Image Area */}
      <GradientProgressHeroFrame
        className="mb-6"
        contentClassName="min-h-88"
        gradientClassName={gradient}
        completion={completion}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
          {/* Share/ExternalLink buttons removed - no functionality implemented */}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium tracking-wider text-white/70 uppercase">
            Learning Plan
          </p>
          <h2 className="mb-1 text-4xl font-bold text-white md:text-5xl">
            {plan.topic}
          </h2>
          <p className="text-xl text-white/80">
            {formatSkillLevel(plan.skillLevel)} • {formatMinutes(totalMinutes)}{' '}
            total
          </p>
        </div>
      </GradientProgressHeroFrame>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<BookOpen />}
          label="Modules"
          value={`${completedModules}/${totalModules}`}
          sublabel="Completed"
        />
        <MetricCard
          icon={<Clock />}
          label="Progress"
          value={`${completion}%`}
          sublabel={`${completedTasks}/${totalTasks} tasks`}
        />
        <MetricCard
          icon={<TrendingUp />}
          label="Total Effort"
          value={formatMinutes(totalMinutes)}
          sublabel={plan.weeklyHours ? `${plan.weeklyHours}h/week` : '—'}
        />
        <MetricCard
          icon={<Calendar />}
          label="Est. Finish"
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
