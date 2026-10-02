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
  /** Library URL with search and status cleared; keeps the current sort. */
  clearFiltersHref?: string;
}

export function EmptyPlansList({
  canCreatePlan,
  searchQuery,
  filterStatus,
  isFirstRun = false,
  clearFiltersHref = ROUTES.PLANS.ROOT,
}: EmptyPlansListProps) {
  const hasFilters = Boolean(searchQuery) || filterStatus !== 'all';
  const showClearFilters = hasFilters && !isFirstRun;
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
      className='flex min-h-72 animate-in flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/40 px-6 py-12 text-center duration-500 fill-mode-both fade-in motion-reduce:animate-none'
      action={
        showClearFilters || canCreatePlan !== undefined ? (
          <>
            {showClearFilters ? (
              <Button asChild>
                <Link href={clearFiltersHref}>Clear filters</Link>
              </Button>
            ) : null}
            {canCreatePlan === undefined ? null : (
              <Button
                asChild
                variant={showClearFilters ? 'outline' : 'default'}
              >
                <Link href={canCreatePlan ? ROUTES.PLANS.NEW : ROUTES.PRICING}>
                  {canCreatePlan ? <Plus /> : null}
                  {canCreatePlan ? 'New plan' : 'Upgrade'}
                </Link>
              </Button>
            )}
          </>
        ) : null
      }
    />
  );
}
