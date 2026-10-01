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
      className='h-full p-5 animate-dashboard-unfold [--dashboard-entry-x:0.75rem] [animation-delay:80ms] motion-reduce:animate-none sm:p-6'
    >
      <h2
        id={TITLE_ID}
        className='text-lg font-semibold text-foreground sm:text-xl'
      >
        Your progress
      </h2>
      <p className='mt-2 text-sm text-muted-foreground'>
        Across every learning plan.
      </p>

      {progress.planCount === 0 ? (
        <p className='mt-6 text-sm text-muted-foreground'>
          Progress will appear here once you have a plan.
        </p>
      ) : (
        <>
          <p className='mt-6 type-title text-foreground tabular-nums'>
            {progress.percent}%
          </p>
          <p className='mt-1 text-xs text-muted-foreground'>Overall progress</p>

          <Progress
            value={progress.percent}
            max={100}
            aria-label='Overall task progress'
            className='mt-3 h-1.5'
          />

          <dl className='mt-4 grid grid-cols-3 gap-3'>
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className='text-xs text-muted-foreground'>{stat.label}</dt>
                <dd className='mt-0.5 text-lg font-semibold text-foreground tabular-nums'>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Card>
  );
}
