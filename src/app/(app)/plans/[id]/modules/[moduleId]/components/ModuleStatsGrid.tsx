import { MetricCard } from '@/components/ui/metric-card';
import { formatMinutes } from '@/features/plans/formatters';
import { BookOpen, Clock, ListTodo } from 'lucide-react';

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
    <div className='mt-4 grid gap-3 sm:grid-cols-3'>
      <MetricCard
        icon={<ListTodo />}
        label='Lessons'
        value={`${completedTasks}/${totalTasks}`}
        sublabel='Completed'
      />
      <MetricCard
        icon={<Clock />}
        label='Duration'
        value={formatMinutes(totalMinutes)}
        sublabel={formatMinutes(estimatedMinutes)}
      />
      <MetricCard
        icon={<BookOpen />}
        label='Progress'
        value={`${completion}%`}
        sublabel={
          completion === 100
            ? 'Module complete!'
            : `${totalTasks - completedTasks} remaining`
        }
      />
    </div>
  );
}
