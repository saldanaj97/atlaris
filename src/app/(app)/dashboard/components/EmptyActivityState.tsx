import type { ActivityFilter } from '../types';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ROUTES } from '@/features/navigation/routes';
import { Activity, Plus } from 'lucide-react';
import Link from 'next/link';

interface EmptyActivityStateProps {
  filter: ActivityFilter;
}

function getFilterLabel(filter: ActivityFilter): string {
  switch (filter) {
    case 'milestone':
      return 'Milestones';
    case 'progress':
      return 'Progress';
    case 'all':
      return 'All';
  }
}

function getFilterDescription(filter: ActivityFilter): string {
  switch (filter) {
    case 'milestone':
      return 'Milestones appear when you complete key goals or reach important checkpoints in your plans.';
    case 'progress':
      return 'Progress updates are tracked as you work through your plans. Complete tasks and mark progress to see updates here.';
    case 'all':
      return "You don't have any activity yet. Create a plan to get started!";
  }
}

export function EmptyActivityState({ filter }: EmptyActivityStateProps) {
  const filterLabel = getFilterLabel(filter);
  const description = getFilterDescription(filter);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Activity />
        </EmptyMedia>
        <EmptyTitle>
          {filter === 'all' ? 'No Activity Yet' : `No ${filterLabel} found`}
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {filter === 'all' && (
        <EmptyContent>
          <Button asChild>
            <Link href={ROUTES.PLANS.NEW}>
              <Plus />
              Create Your First Plan
            </Link>
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
