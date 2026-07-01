import type { FilterStatus } from '@/features/plans/read-projection/types';

import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { FileText, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface EmptyPlansListProps {
  searchQuery: string;
  filterStatus: FilterStatus;
  isFirstRun?: boolean;
}

export function EmptyPlansList({
  searchQuery,
  filterStatus,
  isFirstRun = false,
}: EmptyPlansListProps) {
  const hasFilters = Boolean(searchQuery) || filterStatus !== 'all';
  const title = isFirstRun ? 'No learning plans yet' : 'No plans found';
  const description = isFirstRun
    ? "Start by describing what you want to learn and we'll create a personalized learning plan with resources and milestones."
    : hasFilters
      ? 'No plans match your search or filters. Try adjusting your criteria.'
      : "You haven't created any plans yet. Create your first plan to get started.";
  const Icon = isFirstRun ? Sparkles : FileText;

  return (
    <RouteEmptyState
      icon={Icon}
      title={title}
      description={description}
      className='flex min-h-72 flex-col items-center justify-center overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-br from-primary/10 to-panel px-6 py-12 text-center'
      action={
        <Button asChild>
          <Link href='/plans/new'>
            <Plus />
            New plan
          </Link>
        </Button>
      }
    />
  );
}
