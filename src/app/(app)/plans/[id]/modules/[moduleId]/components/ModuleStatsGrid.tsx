import { formatMinutes } from '@/features/plans/formatters';

function StatCell({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className='min-w-0 px-4 first:pl-0 sm:px-6'>
      <p className='text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase'>
        {label}
      </p>
      <p className='mt-1 truncate text-lg font-semibold text-foreground tabular-nums'>
        {value}
      </p>
      <p className='truncate text-xs text-muted-foreground'>{sublabel}</p>
    </div>
  );
}

/** Ruled stat strip under the module hero — hairlines instead of card tiles. */
export function ModuleStatsGrid({
  completedTasks,
  totalTasks,
  totalMinutes,
  estimatedMinutes,
  completion,
}: {
  completedTasks: number;
  totalTasks: number;
  totalMinutes: number;
  estimatedMinutes: number;
  completion: number;
}) {
  return (
    <dl className='mt-6 grid grid-cols-2 gap-y-4 border-y border-border/60 py-4 sm:flex sm:divide-x sm:divide-border/60'>
      <StatCell
        label='Lessons'
        value={`${completedTasks}/${totalTasks}`}
        sublabel='completed'
      />
      <StatCell
        label='Duration'
        value={formatMinutes(totalMinutes)}
        sublabel={`est. ${formatMinutes(estimatedMinutes)}`}
      />
      <StatCell
        label='Progress'
        value={`${completion}%`}
        sublabel={
          completion === 100
            ? 'Module complete'
            : `${totalTasks - completedTasks} remaining`
        }
      />
    </dl>
  );
}
