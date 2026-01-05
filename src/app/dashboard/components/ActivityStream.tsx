'use client';

import { useState } from 'react';

import type { PlanSummary } from '@/lib/types/db';

import { findActivePlan, generateActivities } from './activity-utils';
import { ActivityCard } from './ActivityCard';
import { ActivityFilterTabs } from './ActivityFilterTabs';
import { ActivityStreamSidebar } from './ActivityStreamSidebar';
import { EmptyActivityState } from './EmptyActivityState';
import { QuickStats } from './QuickStats';

interface ActivityStreamProps {
  summaries: PlanSummary[];
  totalHoursLearned: number;
  activePlans: number;
  completedPlans: number;
  limitsReached: boolean;
}

export function ActivityStream({
  summaries,
  totalHoursLearned,
  activePlans,
  completedPlans,
  limitsReached,
}: ActivityStreamProps) {
  // Suppress unused variable warnings - these will be used for QuickStats in future
  void totalHoursLearned;
  void activePlans;
  void completedPlans;
  void limitsReached;
  const [filter, setFilter] = useState<string>('all');
  const activities = generateActivities(summaries);
  const filteredActivities =
    filter === 'all' ? activities : activities.filter((a) => a.type === filter);

  const activePlan = findActivePlan(summaries);

  return (
    <div className="min-h-screen font-sans">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8">
          <div className="mb-4">
            <h1 className="mb-1 text-2xl font-bold text-slate-900">
              Activity Feed
            </h1>
            <h2 className="text-slate-500">
              Your learning journey, moment by moment
            </h2>
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
    </div>
  );
}
