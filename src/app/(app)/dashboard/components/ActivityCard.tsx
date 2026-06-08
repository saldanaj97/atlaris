import type { ActivityItem } from '../types';
import type React from 'react';

import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { Clock, Target, TrendingUp, Trophy } from 'lucide-react';

const typeConfig: Record<
  ActivityItem['type'],
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    borderColor: string;
  }
> = {
  milestone: {
    icon: Trophy,
    color: 'bg-warning/15 text-warning',
    borderColor: 'border-l-warning',
  },
  progress: {
    icon: TrendingUp,
    color: 'bg-accent/15 text-accent-foreground',
    borderColor: 'border-l-accent',
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
    <Surface
      variant='interactive'
      padding='comfortable'
      className={cn(
        'group relative overflow-hidden border-l-4',
        config.borderColor,
      )}
    >
      <div className='flex gap-4'>
        {/* Icon */}
        <div
          className={cn(
            'flex size-10 flex-shrink-0 items-center justify-center rounded-lg',
            config.color,
          )}
        >
          <Icon className='size-5' />
        </div>

        {/* Content */}
        <div className='min-w-0 flex-1'>
          <div className='mb-1 flex items-start justify-between gap-2'>
            <div>
              <span className='text-xs font-medium text-muted-foreground'>
                {activity.planTitle}
              </span>
              <h4 className='font-semibold text-foreground'>
                {activity.title}
              </h4>
            </div>
            <span className='flex-shrink-0 text-xs text-muted-foreground'>
              {activity.timestamp}
            </span>
          </div>

          {activity.description && (
            <p className='mb-3 text-sm text-muted-foreground'>
              {activity.description}
            </p>
          )}

          {/* Metadata */}
          {activity.metadata && (
            <ActivityCardMetadata metadata={activity.metadata} />
          )}
        </div>
      </div>
    </Surface>
  );
}
