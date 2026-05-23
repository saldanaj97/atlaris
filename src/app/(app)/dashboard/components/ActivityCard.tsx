import { Clock, Target, TrendingUp, Trophy } from 'lucide-react';
import type React from 'react';

import { cn } from '@/lib/utils';
import type { ActivityItem } from '../types';

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
    color: 'bg-amber-100 text-amber-600',
    borderColor: 'border-l-amber-400',
  },
  progress: {
    icon: TrendingUp,
    color: 'bg-cyan-100 text-cyan-600',
    borderColor: 'border-l-cyan-400',
  },
};

function ActivityCardMetadata({
  metadata,
}: {
  metadata: NonNullable<ActivityItem['metadata']>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {metadata.duration && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {metadata.duration}
        </span>
      )}
      {metadata.progress !== undefined && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Target className="h-3 w-3" />
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
    <article
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-l-4 border-panel-border bg-panel p-5 shadow-sm transition hover:shadow-md',
        config.borderColor,
      )}
    >
      <div className="flex gap-4">
        {/* Icon */}
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
            config.color,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                {activity.planTitle}
              </span>
              <h4 className="font-semibold text-foreground">
                {activity.title}
              </h4>
            </div>
            <span className="flex-shrink-0 text-xs text-muted-foreground">
              {activity.timestamp}
            </span>
          </div>

          {activity.description && (
            <p className="mb-3 text-sm text-muted-foreground">
              {activity.description}
            </p>
          )}

          {/* Metadata */}
          {activity.metadata && (
            <ActivityCardMetadata metadata={activity.metadata} />
          )}
        </div>
      </div>
    </article>
  );
}
