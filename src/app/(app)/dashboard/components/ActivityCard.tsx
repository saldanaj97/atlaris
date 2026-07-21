import type { ActivityItem } from '../types';

import { cn } from '@/lib/utils';
import { Trophy, TrendingUp } from 'lucide-react';
import Link from 'next/link';

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

const typeIcon = {
  milestone: Trophy,
  progress: TrendingUp,
} as const;

/**
 * Quiet activity row — card surface, line border, noteBg icon well.
 */
export function ActivityCard({ activity }: { activity: ActivityItem }) {
  const Icon = typeIcon[activity.type];

  return (
    <Link
      href={`/plans/${activity.planId}`}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-panel-border bg-panel px-4 py-3.5',
        'text-panel-foreground transition-colors hover:border-primary/35 hover:bg-secondary/40',
        'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
      )}
    >
      {/* noteBg (#351b30 → muted / panel-muted) icon well */}
      <span
        className='flex size-9 shrink-0 items-center justify-center rounded-full border border-panel-border bg-muted text-muted-foreground'
        aria-hidden='true'
      >
        <Icon className='size-3.5' />
      </span>

      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium text-foreground'>
          {activity.title}
        </p>
        <p className='mt-0.5 truncate text-[11px] font-normal text-muted-foreground tabular-nums'>
          {truncateId(activity.planId)}
          {activity.metadata?.progress !== undefined
            ? ` · ${activity.metadata.progress}%`
            : null}
        </p>
      </div>

      <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
        {activity.timestamp}
      </span>
    </Link>
  );
}
