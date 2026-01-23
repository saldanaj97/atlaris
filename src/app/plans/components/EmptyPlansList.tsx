import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';

import type { FilterStatus } from '@/app/plans/types';

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
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText />
        </EmptyMedia>
        <EmptyTitle>No Plans Found</EmptyTitle>
        <EmptyDescription>
          {hasFilters
            ? 'No plans found matching your filters. Try adjusting your search or filter criteria.'
            : "You haven't created any plans yet. Get started by creating your first plan."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/plans/new">
            <Plus className="h-4 w-4" />
            New Plan
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
