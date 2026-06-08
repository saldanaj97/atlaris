import type { FilterStatus } from '@/features/plans/read-projection/types';

import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';

interface EmptyPlansListProps {
  searchQuery: string;
  filterStatus: FilterStatus;
}

export function EmptyPlansList({
  searchQuery,
  filterStatus,
}: EmptyPlansListProps) {
  const hasFilters = searchQuery || filterStatus !== 'all';

  return (
    <RouteEmptyState
      icon={FileText}
      title='No plans found'
      description={
        hasFilters
          ? 'No plans match your search or filters. Try adjusting your criteria.'
          : "You haven't created any plans yet. Create your first plan to get started."
      }
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
