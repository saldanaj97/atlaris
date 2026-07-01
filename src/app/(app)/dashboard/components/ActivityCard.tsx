import type { ActivityItem } from '../types';
import type React from 'react';

import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { Clock, Target, TrendingUp, Trophy } from 'lucide-react';

const typeConfig: Record<
  ActivityItem['type'],
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    stampClassName: string;
  }
> = {
  milestone: {
    icon: Trophy,
    label: 'Milestone',
    stampClassName: 'border-warning/30 bg-warning/10 text-warning',
  },
  progress: {
    icon: TrendingUp,
    label: 'Progress',
    stampClassName: 'border-primary/30 bg-primary/10 text-primary',
  },
};

function ActivityCardMetadata({
  metadata,
}: {
  metadata: NonNullable<ActivityItem['metadata']>;
}) {
  return (
    <div className='flex flex-wrap items-center gap-3'>
      {metadata.duration && (
        <span className='flex items-center gap-1 text-xs text-muted-foreground'>
          <Clock className='size-3' />
          {metadata.duration}
        </span>
      )}
      {metadata.progress !== undefined && (
        <span className='flex items-center gap-1 text-xs text-muted-foreground'>
          <Target className='size-3' />
          {metadata.progress}% complete
        </span>
      )}
    </div>
  );
}

export function ActivityCard({ activity }: { activity: ActivityItem }) {
  const config = typeConfig[activity.type];
  const Icon = config.icon;

  return (
    <Surface variant='interactive' padding='none' className='overflow-hidden'>
      <div className='p-4 sm:p-5'>
        <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='mb-2 flex flex-wrap items-center gap-2'>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium tracking-wide uppercase',
                  config.stampClassName,
                )}
              >
                <Icon className='size-3' aria-hidden='true' />
                {config.label}
              </span>
              <span className='text-xs font-medium text-muted-foreground'>
                {activity.planTitle}
              </span>
            </div>
            <h4 className='font-semibold text-foreground'>{activity.title}</h4>
          </div>

          <span className='shrink-0 rounded-md border border-border bg-panel-muted px-2 py-1 text-[11px] font-medium text-muted-foreground'>
            {activity.timestamp}
          </span>
        </div>

        {activity.description && (
          <p className='text-sm text-muted-foreground'>
            {activity.description}
          </p>
        )}

        {activity.metadata && (
          <div className='mt-4 border-t border-border/70 pt-3'>
            <ActivityCardMetadata metadata={activity.metadata} />
          </div>
        )}
      </div>
    </Surface>
  );
}
