import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Activity, Plus } from 'lucide-react';
import Link from 'next/link';

import type { ActivityFilter, ActivityLabel } from '../types';

interface EmptyActivityStateProps {
  filter: ActivityFilter;
}

function getFilterLabel(filter: ActivityFilter): ActivityLabel {
  switch (filter) {
    case 'all':
      return 'All';
    case 'session':
      return 'Sessions';
    case 'milestone':
      return 'Milestones';
    case 'progress':
      return 'Progress';
    case 'export':
      return 'Exports';
    default:
      return 'All';
  }
}

function getFilterDescription(filter: ActivityFilter): string {
  switch (filter) {
    case 'session':
      return 'Sessions are created when you begin a new learning session by clicking the "Start Session" button in a plan.';
    case 'milestone':
      return 'Milestones appear when you complete key goals or reach important checkpoints in your plans.';
    case 'progress':
      return 'Progress updates are tracked as you work through your plans. Complete tasks and mark progress to see updates here.';
    case 'export':
      return 'Exports are created when you export your plans or content to external platforms like Google Calendar.';
    default:
      return "You don't have any activity yet. Create a plan to get started!";
  }
}

export function EmptyActivityState({ filter }: EmptyActivityStateProps) {
  const filterLabel = getFilterLabel(filter);
  const description = getFilterDescription(filter);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
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
            <Link href="/plans/new">
              <Plus className="h-4 w-4" />
              Create Your First Plan
            </Link>
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
