'use client';

import { useState } from 'react';

import { findActivePlan, generateActivities } from './activity-utils';
import { ActivityCard } from './ActivityCard';
import { ActivityFilterTabs } from './ActivityFilterTabs';
import { ActivityStreamSidebar } from './ActivityStreamSidebar';
import { EmptyActivityState } from './EmptyActivityState';
import { QuickStats } from './QuickStats';

import type { PlanSummary } from '@/lib/types/db';
import type { ActivityFilter } from '../types';

interface ActivityStreamProps {
  summaries: PlanSummary[];
}

export function ActivityStream({ summaries }: ActivityStreamProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const activities = generateActivities(summaries);
  const filteredActivities =
    filter === 'all' ? activities : activities.filter((a) => a.type === filter);

  const activePlan = findActivePlan(summaries);

  return (
    <div className="font-sans">
      <header className="mb-8">
        <div className="mb-4">
          <h1>Activity Feed</h1>
          <h2 className="subtitle">Your learning journey, moment by moment</h2>
        </div>
        <section aria-label="Quick statistics">
          <QuickStats />
        </section>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Feed */}
        <div className="lg:col-span-2">
          <ActivityFilterTabs
            activeFilter={filter}
            onFilterChange={setFilter}
          />

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

        {/* Sidebar */}
        <ActivityStreamSidebar activePlan={activePlan} />
      </div>
    </div>
  );
}
