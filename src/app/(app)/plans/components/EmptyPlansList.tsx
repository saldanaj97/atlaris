import type { FilterStatus } from '@/features/plans/read-projection/types';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
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
    <Surface
      className='flex min-h-72 flex-col items-center justify-center overflow-hidden border-primary/20 bg-linear-to-br from-primary/10 to-panel px-6 py-12 text-center'
    >
      <div
        className='mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground'
        aria-hidden='true'
      >
        <Icon className='size-5' />
      </div>
      <h2 className='text-xl font-semibold text-foreground'>{title}</h2>
      <p className='mt-2 max-w-md text-sm leading-6 text-muted-foreground'>
        {description}
      </p>
      <div className='mt-5'>
        <Button asChild>
          <Link href='/plans/new'>
            <Plus />
            New plan
          </Link>
        </Button>
      </div>
    </Surface>
  );
}
