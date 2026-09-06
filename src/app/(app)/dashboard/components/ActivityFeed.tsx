import type { ActivityItem } from '../types';

import { ActivityCard } from './ActivityCard';
import { EmptyActivityState } from './EmptyActivityState';
import { Card } from '@/components/ui/card';

interface ActivityFeedProps {
  activities: ActivityItem[];
}

/** Dashboard ledger for generated, progressed, and completed plans. */
export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card
      as='section'
      aria-labelledby='activity-feed-heading'
      className='gap-0 overflow-hidden p-0'
    >
      <header className='border-b border-border/60 px-5 py-5 sm:px-6'>
        <h2
          id='activity-feed-heading'
          className='text-lg font-semibold text-foreground'
        >
          Activity feed
        </h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Plans generated, progress made, and routes completed.
        </p>
      </header>

      {activities.length === 0 ? (
        <EmptyActivityState />
      ) : (
        <ul className='divide-y divide-border/50'>
          {activities.map((activity, index) => (
            <li key={activity.id}>
              <ActivityCard activity={activity} index={index} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
