import { StatCell } from '@/app/(app)/plans/[id]/components/StatCell';
import { formatMinutes } from '@/features/plans/formatters';

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
        className='px-4 first:pl-0 sm:px-6'
        truncate
        label='Lessons'
        value={`${completedTasks}/${totalTasks}`}
        sublabel='completed'
      />
      <StatCell
        className='px-4 first:pl-0 sm:px-6'
        truncate
        label='Duration'
        value={formatMinutes(totalMinutes)}
        sublabel={`est. ${formatMinutes(estimatedMinutes)}`}
      />
      <StatCell
        className='px-4 first:pl-0 sm:px-6'
        truncate
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
