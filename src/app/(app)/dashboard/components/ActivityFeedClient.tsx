'use client';

import type { ActivityItem } from '../types';

import { ActivityCard } from './ActivityCard';
import { EmptyActivityState } from './EmptyActivityState';

interface ActivityFeedClientProps {
  activities: ActivityItem[];
}

/**
 * Quiet recent-activity list — After Hours canvas composition (no filter chrome).
 */
export function ActivityFeedClient({ activities }: ActivityFeedClientProps) {
  return (
    <section aria-label='Recent activity'>
      <h2 className='mb-4 text-base font-semibold text-foreground'>
        Recent activity
      </h2>

      {activities.length === 0 ? (
        <EmptyActivityState />
      ) : (
        <ul className='space-y-3'>
          {activities.map((activity) => (
            <li key={activity.id}>
              <ActivityCard activity={activity} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
