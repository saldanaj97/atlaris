import type { ActivityItem } from '../types';

import { cn } from '@/lib/utils';
import { ArrowUpRight, Check, Sparkles } from 'lucide-react';
import Link from 'next/link';

const activityPresentation = {
  generated: {
    icon: Sparkles,
    label: 'Plan generated',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  progress: {
    icon: ArrowUpRight,
    label: 'Progress made',
    className: 'border-chart-2/30 bg-chart-2/10 text-chart-2',
  },
  completed: {
    icon: Check,
    label: 'Plan completed',
    className: 'border-success/30 bg-success/10 text-success',
  },
} as const;

/**
 * Dashboard activity event with an explicit event label and timestamp.
 */
export function ActivityCard({
  activity,
  index = 0,
}: {
  activity: ActivityItem;
  index?: number;
}) {
  const presentation = activityPresentation[activity.kind];
  const Icon = presentation.icon;

  return (
    <Link
      href={`/plans/${activity.planId}`}
      className='group grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 transition-colors duration-150 animate-dashboard-ledger-row hover:bg-panel-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset motion-reduce:animate-none motion-reduce:transition-none sm:px-6'
      style={{ animationDelay: `${360 + Math.min(index, 8) * 55}ms` }}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[8px] border',
          presentation.className,
        )}
        aria-hidden='true'
      >
        <Icon className='size-4' />
      </span>

      <div className='min-w-0'>
        <p className='text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase'>
          {presentation.label}
        </p>
        <p className='mt-0.5 truncate text-sm font-medium text-foreground'>
          {activity.title}
        </p>
      </div>

      <div className='text-right'>
        <time
          dateTime={activity.occurredAt}
          className='text-xs text-muted-foreground tabular-nums'
        >
          {activity.timestamp}
        </time>
      </div>
    </Link>
  );
}
