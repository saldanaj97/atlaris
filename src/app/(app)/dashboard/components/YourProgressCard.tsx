import type { DashboardProgressTotals } from '@/features/plans/read-projection/dashboard-progress';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const TITLE_ID = 'dashboard-your-progress-heading';

export function YourProgressCard({
  progress,
}: {
  progress: DashboardProgressTotals;
}) {
  if (progress.planCount === 0) {
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
          Across every active learning plan.
        </p>
        <p className='mt-6 text-sm text-muted-foreground'>
          Progress will appear here once you have a plan.
        </p>
      </Card>
    );
  }

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
        Across every active learning plan.
      </p>

      <p className='font-heading mt-6 text-[32px] leading-10 tracking-[-0.02em] text-foreground tabular-nums'>
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
        <div>
          <dt className='text-xs text-muted-foreground'>Modules</dt>
          <dd className='mt-0.5 text-lg font-semibold text-foreground tabular-nums'>
            {progress.completedModules}/{progress.totalModules}
          </dd>
        </div>
        <div>
          <dt className='text-xs text-muted-foreground'>Tasks</dt>
          <dd className='mt-0.5 text-lg font-semibold text-foreground tabular-nums'>
            {progress.completedTasks}/{progress.totalTasks}
          </dd>
        </div>
        <div>
          <dt className='text-xs text-muted-foreground'>Plans</dt>
          <dd className='mt-0.5 text-lg font-semibold text-foreground tabular-nums'>
            {progress.planCount}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
