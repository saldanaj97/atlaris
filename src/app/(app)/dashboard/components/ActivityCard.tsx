import type { ActivityItem } from '../types';
import type { CSSProperties } from 'react';

import { formatMinutes } from '@/features/plans/formatters';
import { Check, Circle, CircleDot, FilePlus } from 'lucide-react';
import Link from 'next/link';

const activityPresentation = {
  'plan-created': { icon: FilePlus, label: 'Plan created' },
  'task-completed': { icon: Check, label: 'Completed' },
  'task-started': { icon: CircleDot, label: 'Started' },
  'task-reset': { icon: Circle, label: 'Marked not started' },
} as const;

function getActivityMeta(activity: ActivityItem): string {
  const parts: string[] = [activityPresentation[activity.kind].label];
  if (activity.planTopic) {
    parts.push(activity.planTopic);
  }
  if (activity.minutes) {
    parts.push(formatMinutes(activity.minutes));
  }
  return parts.join(' · ');
}

/**
 * Dashboard activity row: what happened, to which task or plan, and when.
 */
export function ActivityCard({
  activity,
  index = 0,
}: {
  activity: ActivityItem;
  index?: number;
}) {
  const Icon = activityPresentation[activity.kind].icon;

  return (
    <Link
      href={`/plans/${activity.planId}`}
      className='group grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 transition-colors duration-150 animate-dashboard-ledger-row hover:bg-panel-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset motion-reduce:animate-none motion-reduce:transition-none sm:px-6'
      style={
        {
          '--activity-delay': `${360 + Math.min(index, 8) * 55}ms`,
        } as CSSProperties
      }
    >
      <Icon className='size-4 text-muted-foreground' aria-hidden='true' />

      <div className='min-w-0'>
        <p className='truncate type-label text-foreground'>{activity.title}</p>
        <p className='mt-0.5 truncate type-meta text-muted-foreground'>
          {getActivityMeta(activity)}
        </p>
      </div>

      <div className='text-right'>
        <time
          dateTime={activity.occurredAt}
          className='type-meta text-muted-foreground tabular-nums'
        >
          {activity.timestamp}
        </time>
      </div>
    </Link>
  );
}
