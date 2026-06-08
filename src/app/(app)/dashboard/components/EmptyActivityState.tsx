import type { ActivityFilter } from '../types';

import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { ROUTES } from '@/features/navigation/routes';
import { Activity, Plus } from 'lucide-react';
import Link from 'next/link';

interface EmptyActivityStateProps {
  filter: ActivityFilter;
}

function getFilterLabel(filter: ActivityFilter): string {
  switch (filter) {
    case 'milestone':
      return 'milestones';
    case 'progress':
      return 'progress updates';
    case 'all':
      return 'activity';
  }
}

function getFilterDescription(filter: ActivityFilter): string {
  switch (filter) {
    case 'milestone':
      return 'Milestones appear when you complete key goals or reach checkpoints in your plans.';
    case 'progress':
      return 'Progress updates appear as you work through tasks and mark items complete.';
    case 'all':
      return "You don't have any activity yet. Create a plan to get started.";
  }
}

export function EmptyActivityState({ filter }: EmptyActivityStateProps) {
  const filterLabel = getFilterLabel(filter);
  const description = getFilterDescription(filter);

  return (
    <RouteEmptyState
      icon={Activity}
      title={filter === 'all' ? 'No activity yet' : `No ${filterLabel} found`}
      description={description}
      action={
        filter === 'all' ? (
          <Button asChild>
            <Link href={ROUTES.PLANS.NEW}>
              <Plus />
              Create your first plan
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
}
