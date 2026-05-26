'use client';

import type { ActivityFilter, ActivityItem } from '../types';

import { ActivityCard } from './ActivityCard';
import { EmptyActivityState } from './EmptyActivityState';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';

interface ActivityFeedClientProps {
  activities: ActivityItem[];
}

const FILTER_TABS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'milestone', label: 'Milestones' },
  { id: 'progress', label: 'Progress' },
];

export function ActivityFeedClient({ activities }: ActivityFeedClientProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const filteredActivities =
    filter === 'all'
      ? activities
      : activities.filter((activity) => activity.type === filter);

  return (
    <section aria-label='Activity feed' className='lg:col-span-2'>
      <div className='mb-6 flex items-center gap-2 border-b border-border pb-4'>
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as ActivityFilter)}
        >
          <TabsList className='h-auto gap-1 bg-transparent p-0'>
            {FILTER_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className='rounded-lg'>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className='space-y-4'>
        {filteredActivities.length === 0 ? (
          <EmptyActivityState filter={filter} />
        ) : (
          filteredActivities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))
        )}
      </div>
    </section>
  );
}
