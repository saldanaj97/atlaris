import type { PlanOverviewStats } from '@/app/(app)/plans/[id]/types';
import type { ClientPlanDetail } from '@/shared/types/client.types';

import { StatCell } from '@/app/(app)/plans/[id]/components/StatCell';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Surface } from '@/components/ui/surface';
import { planDetailPath } from '@/features/navigation/routes';
import {
  formatLearningStyle,
  formatMinutes,
  formatSkillLevel,
  formatWeeklyHours,
} from '@/features/plans/formatters';
import { ArrowRight, BookOpen, CircleGauge, Clock3, Route } from 'lucide-react';
import Link from 'next/link';

interface PlanSummaryRailProps {
  plan: ClientPlanDetail;
  stats: PlanOverviewStats;
  activeModuleId: string | null;
}

/** Compact plan-level context that supports the route without duplicating module controls. */
export function PlanSummaryRail({
  plan,
  stats,
  activeModuleId,
}: PlanSummaryRailProps) {
  const activeModule = activeModuleId
    ? plan.modules.find((module) => module.id === activeModuleId)
    : undefined;
  const activeModuleHref = activeModule
    ? `${planDetailPath(plan.id)}/modules/${activeModule.id}`
    : '#learning-path';
  const isPlanComplete =
    plan.modules.length > 0 &&
    stats.totalModules > 0 &&
    stats.totalTasks > 0 &&
    stats.completedModules === stats.totalModules &&
    stats.completedTasks === stats.totalTasks;

  return (
    <aside className='space-y-4' aria-label='Plan summary'>
      <section aria-labelledby='plan-progress-heading'>
        <Surface padding='none' className='overflow-hidden'>
          <div className='flex items-start justify-between gap-4 border-b border-border/60 px-5 py-5'>
            <div className='flex items-center gap-3'>
              <span
                className='flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary'
                aria-hidden='true'
              >
                <CircleGauge className='size-4' />
              </span>
              <div>
                <h2
                  id='plan-progress-heading'
                  className='font-semibold text-foreground'
                >
                  Your progress
                </h2>
                <p className='mt-1 text-xs text-muted-foreground'>
                  Overall plan progress
                </p>
              </div>
            </div>
            <span className='text-2xl font-semibold text-foreground tabular-nums'>
              {stats.completionPercentage}%
            </span>
          </div>

          <div className='px-5 py-5'>
            <Progress
              value={stats.completionPercentage}
              aria-label={`Overall plan progress: ${stats.completionPercentage}%`}
              className='h-2'
            />
            <dl className='mt-5 grid grid-cols-2 divide-x divide-border/60'>
              <StatCell
                className='pr-4'
                label='Tasks'
                value={`${stats.completedTasks}/${stats.totalTasks}`}
                sublabel='complete'
              />
              <StatCell
                className='pl-4'
                label='Modules'
                value={`${stats.completedModules}/${stats.totalModules}`}
                sublabel='complete'
              />
            </dl>
          </div>
        </Surface>
      </section>

      <section aria-labelledby='plan-details-heading'>
        <Surface padding='none' className='p-5'>
          <div className='flex items-center gap-3'>
            <span
              className='flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-panel-muted text-muted-foreground'
              aria-hidden='true'
            >
              <Route className='size-4' />
            </span>
            <div>
              <h2
                id='plan-details-heading'
                className='font-semibold text-foreground'
              >
                Plan details
              </h2>
              <p className='mt-1 text-xs text-muted-foreground'>
                Your current learning setup
              </p>
            </div>
          </div>

          <dl className='mt-5 space-y-3 border-t border-border/60 pt-4'>
            <DetailRow
              label='Skill level'
              value={formatSkillLevel(plan.skillLevel)}
            />
            <DetailRow
              label='Learning style'
              value={formatLearningStyle(plan.learningStyle)}
            />
            <DetailRow
              label='Weekly pace'
              value={
                plan.weeklyHours > 0
                  ? formatWeeklyHours(plan.weeklyHours)
                  : 'Not set'
              }
            />
            <DetailRow
              label='Estimated finish'
              value={stats.estimatedCompletionDate ?? 'Not calculated'}
            />
          </dl>
        </Surface>
      </section>

      <section aria-labelledby='plan-next-up-heading'>
        <Surface padding='none' className='p-5'>
          <div className='flex items-center justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <span
                className='flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-panel-muted text-muted-foreground'
                aria-hidden='true'
              >
                <BookOpen className='size-4' />
              </span>
              <h2
                id='plan-next-up-heading'
                className='font-semibold text-foreground'
              >
                Next up
              </h2>
            </div>
            {activeModule ? (
              <Clock3
                className='size-4 text-muted-foreground'
                aria-hidden='true'
              />
            ) : null}
          </div>

          {activeModule ? (
            <Link
              href={activeModuleHref}
              className='group mt-4 flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-panel-muted/50 p-3 transition-[border-color,background-color] outline-none hover:border-primary/30 hover:bg-panel-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50'
            >
              <span className='min-w-0'>
                <span className='block text-[11px] font-medium tracking-[0.12em] text-primary uppercase'>
                  Week {activeModule.order}
                </span>
                <span className='mt-1 block font-medium wrap-break-word text-foreground'>
                  {activeModule.title}
                </span>
                <span className='mt-1 block text-xs text-muted-foreground'>
                  {formatMinutes(activeModule.estimatedMinutes)} ·{' '}
                  {activeModule.tasks.length} task
                  {activeModule.tasks.length === 1 ? '' : 's'}
                </span>
              </span>
              <ArrowRight
                className='mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5'
                aria-hidden='true'
              />
            </Link>
          ) : isPlanComplete ? (
            <div className='mt-4 rounded-lg border border-success/30 bg-success/5 p-3 dark:bg-success/10'>
              <p className='text-sm font-medium text-success'>Plan complete</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                Review the route to revisit any module.
              </p>
              <Button asChild variant='soft-primary' size='sm' className='mt-3'>
                <a href='#learning-path'>Review roadmap</a>
              </Button>
            </div>
          ) : (
            <div className='mt-4 rounded-lg border border-border/70 bg-panel-muted/50 p-3'>
              <p className='text-sm font-medium text-foreground'>
                No next module available.
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                Review the route to revisit any module.
              </p>
              <Button asChild variant='soft-primary' size='sm' className='mt-3'>
                <a href='#learning-path'>Review roadmap</a>
              </Button>
            </div>
          )}
        </Surface>
      </section>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-baseline justify-between gap-4 text-sm'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='text-right font-medium text-foreground'>{value}</dd>
    </div>
  );
}
