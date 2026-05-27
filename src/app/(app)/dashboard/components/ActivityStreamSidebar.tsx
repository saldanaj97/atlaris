import type { PlanSummary } from '@/shared/types/db.types';
import type { JSX } from 'react';

import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { BookOpen, Calendar } from 'lucide-react';
import Link from 'next/link';

interface ActivityStreamSidebarProps {
  activePlan?: PlanSummary;
}

const SIDEBAR_CARD_CLASS =
  'rounded-2xl border border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-sm';
const SIDEBAR_SECONDARY_TEXT_CLASS = 'text-sidebar-foreground/70';

function EmptyStateCard() {
  return (
    <div className={SIDEBAR_CARD_CLASS}>
      <div className='flex flex-col items-center py-6 text-center'>
        <div className='mb-4 flex size-12 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground'>
          <BookOpen className='size-6' />
        </div>
        <h3 className='mb-2 font-medium text-sidebar-foreground'>
          No active learning plan
        </h3>
        <p className={cn('mb-4 text-sm', SIDEBAR_SECONDARY_TEXT_CLASS)}>
          Create a new plan to start your learning journey
        </p>
        <Button asChild>
          <Link href={ROUTES.PLANS.NEW}>Create New Plan</Link>
        </Button>
      </div>
    </div>
  );
}

function NoUpcomingEventsCard() {
  return (
    <div className={SIDEBAR_CARD_CLASS}>
      <div className='flex flex-col items-center py-6 text-center'>
        <div className='mb-4 flex size-12 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground'>
          <Calendar className='size-6' />
        </div>
        <h3 className='mb-2 font-medium text-sidebar-foreground'>
          No upcoming events
        </h3>
        <p className={cn('mb-4 text-sm', SIDEBAR_SECONDARY_TEXT_CLASS)}>
          Add sessions to your active plan to keep learning momentum.
        </p>
        <Button asChild>
          <Link href={ROUTES.PLANS.ROOT}>View Plans</Link>
        </Button>
      </div>
    </div>
  );
}

export function ActivityStreamSidebar({
  activePlan,
}: ActivityStreamSidebarProps): JSX.Element {
  return (
    <aside className='flex w-full flex-col gap-4'>
      {activePlan ? <NoUpcomingEventsCard /> : <EmptyStateCard />}
    </aside>
  );
}
