'use client';

import { useMemo, useState } from 'react';
import { ActivityCard } from './ActivityCard';
import { ActivityFilterTabs } from './ActivityFilterTabs';
import { EmptyActivityState } from './EmptyActivityState';

import type { ActivityFilter, ActivityItem } from '../types';

interface ActivityFeedClientProps {
  activities: ActivityItem[];
}

export function ActivityFeedClient({ activities }: ActivityFeedClientProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const filteredActivities = useMemo(() => {
    if (filter === 'all') return activities;
    return activities.filter((a) => a.type === filter);
  }, [activities, filter]);

  return (
    <div className="lg:col-span-2">
      <ActivityFilterTabs activeFilter={filter} onFilterChange={setFilter} />

      {/* Activity Items */}
      <div className="space-y-4">
        {filteredActivities.length === 0 ? (
          <EmptyActivityState filter={filter} />
        ) : (
          filteredActivities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))
        )}
      </div>
    </div>
  );
}
