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
    className: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
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
      className='group animate-dashboard-ledger-row grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors duration-500 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset motion-reduce:animate-none sm:px-6'
      style={{ animationDelay: `${360 + Math.min(index, 8) * 55}ms` }}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full border',
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
        {activity.kind === 'progress' ? (
          <p className='text-sm font-semibold text-foreground tabular-nums'>
            {activity.progress}%
          </p>
        ) : null}
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
