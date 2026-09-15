import { Card } from '@/components/ui/card';

const TITLE_ID = 'dashboard-weekly-pace-heading';

export function WeeklyPaceCard({ weeklyHours }: { weeklyHours?: number }) {
  if (weeklyHours == null) {
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
          This week
        </h2>
        <p className='mt-2 text-sm text-muted-foreground'>
          Weekly learning pace
        </p>
        <p className='mt-6 text-xl font-semibold text-foreground'>
          No pace set yet
        </p>
        <p className='mt-2 text-sm text-muted-foreground'>
          Your weekly learning pace will appear with an active plan.
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
        This week
      </h2>
      <p className='mt-2 text-sm text-muted-foreground'>Weekly learning pace</p>

      <p className='mt-6 text-3xl font-semibold text-foreground tabular-nums'>
        {weeklyHours} hr{weeklyHours === 1 ? '' : 's'} planned
      </p>

      <div className='mt-6 border-t border-border/50 pt-4'>
        <p className='text-base font-medium text-foreground'>
          Progress tracking coming soon
        </p>
        <p className='mt-1 text-sm text-muted-foreground'>
          Completed learning time will appear here once it can be measured.
        </p>
      </div>
    </Card>
  );
}
