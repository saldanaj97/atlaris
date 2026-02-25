'use client';

import { useMemo, useState } from 'react';

import { findActivePlan, generateActivities } from './activity-utils';
import { ActivityCard } from './ActivityCard';
import { ActivityFilterTabs } from './ActivityFilterTabs';
import { ActivityStreamSidebar } from './ActivityStreamSidebar';
import { EmptyActivityState } from './EmptyActivityState';
import { ResumeLearningHero } from './ResumeLearningHero';

import type { PlanSummary } from '@/lib/types/db';
import type { ActivityFilter } from '../types';

interface ActivityStreamProps {
  summaries: PlanSummary[];
}

export function ActivityStream({ summaries }: ActivityStreamProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const activities = useMemo(() => generateActivities(summaries), [summaries]);
  const activePlan = useMemo(() => findActivePlan(summaries), [summaries]);
  const filteredActivities = useMemo(
    () =>
      filter === 'all'
        ? activities
        : activities.filter((a) => a.type === filter),
    [activities, filter]
  );

  return (
    <div className="font-sans">
      <header className="mb-8">
        <div className="mb-6">
          <h1>Activity Feed</h1>
          <h2 className="subtitle">Your learning journey, moment by moment</h2>
        </div>
        {activePlan && (
          <section aria-label="Resume learning">
            <ResumeLearningHero plan={activePlan} />
          </section>
        )}
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
        <ActivityStreamSidebar activePlan={activePlan} isVisible />
      </div>
    </div>
  );
}
