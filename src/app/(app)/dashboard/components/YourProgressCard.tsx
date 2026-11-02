import type { DashboardProgressTotals } from '@/features/plans/read-projection/dashboard-progress';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const TITLE_ID = 'dashboard-your-progress-heading';

export function YourProgressCard({
  progress,
}: {
  progress: DashboardProgressTotals;
}) {
  const stats = [
    {
      label: 'Modules',
      value: `${progress.completedModules}/${progress.totalModules}`,
    },
    {
      label: 'Tasks',
      value: `${progress.completedTasks}/${progress.totalTasks}`,
    },
    { label: 'Plans', value: progress.planCount },
  ];

  return (
    <Card
      as='aside'
      aria-labelledby={TITLE_ID}
      className='h-full gap-0 p-5 animate-dashboard-unfold [--dashboard-entry-x:0.75rem] [animation-delay:80ms] motion-reduce:animate-none sm:p-6'
    >
      <h2 id={TITLE_ID} className='type-card text-foreground'>
        Your progress
      </h2>
      <p className='mt-2 type-body text-muted-foreground'>
        Across every learning plan.
      </p>

      {progress.planCount === 0 ? (
        <p className='mt-6 type-body text-muted-foreground'>
          Progress will appear here once you have a plan.
        </p>
      ) : (
        <div className='mt-6'>
          <p className='type-title text-foreground tabular-nums'>
            {progress.percent}%
          </p>
          <p className='mt-1 type-meta text-muted-foreground'>
            Overall progress
          </p>

          <Progress
            value={progress.percent}
            max={100}
            aria-label='Overall task progress'
            className='mt-3 h-1.5'
          />

          {/* One row per total, so the card's height (set by the resume card
              beside it) is filled by the totals rather than left empty. */}
          <dl className='mt-3 divide-y divide-border/60'>
            {stats.map((stat) => (
              <div
                key={stat.label}
                className='flex items-baseline justify-between gap-3 py-2'
              >
                <dt className='type-body text-muted-foreground'>
                  {stat.label}
                </dt>
                <dd className='type-label text-foreground tabular-nums'>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}
