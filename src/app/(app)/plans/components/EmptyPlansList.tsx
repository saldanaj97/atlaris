import type { FilterStatus } from '@/features/plans/read-projection/types';

import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { ROUTES } from '@/features/navigation/routes';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';

interface EmptyPlansListProps {
  canCreatePlan?: boolean;
  searchQuery: string;
  filterStatus: FilterStatus;
  isFirstRun?: boolean;
}

export function EmptyPlansList({
  canCreatePlan,
  searchQuery,
  filterStatus,
  isFirstRun = false,
}: EmptyPlansListProps) {
  const hasFilters = Boolean(searchQuery) || filterStatus !== 'all';
  const title = isFirstRun ? 'No learning plans yet' : 'No plans found';
  const description = isFirstRun
    ? 'Name a goal. Atlaris charts the modules, tasks, and resources.'
    : hasFilters
      ? 'No plans match your search or filters. Try adjusting your criteria.'
      : 'Create a plan and pick up when the night is quiet.';

  return (
    <RouteEmptyState
      icon={FileText}
      title={title}
      description={description}
      className='flex min-h-72 animate-in flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/40 px-6 py-12 text-center animation-duration-500 fill-mode-both fade-in motion-reduce:animate-none'
      action={
        canCreatePlan === undefined ? null : (
          <Button asChild>
            <Link href={canCreatePlan ? ROUTES.PLANS.NEW : ROUTES.PRICING}>
              {canCreatePlan ? <Plus /> : null}
              {canCreatePlan ? 'New plan' : 'Upgrade'}
            </Link>
          </Button>
        )
      }
    />
  );
}
