import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';

/**
 * Skeleton for the plans content (search, sort, filters, list).
 * Header title, usage summary, and New Plan button are rendered by the page.
 */
export function PlansContentSkeleton() {
  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2'>
        <div className='relative w-full min-w-0 flex-1'>
          <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
          <Skeleton className='h-9 w-full rounded-md' />
        </div>
        <div className='flex shrink-0 items-center gap-1.5 sm:gap-2'>
          <Skeleton className='h-8 w-28 shrink-0 rounded-md' />
        </div>
      </div>

      <div>
        <div className='flex w-full items-center gap-2 overflow-hidden border-b border-border pb-2'>
          <div className='flex shrink-0 items-center px-2'>
            <Skeleton className='size-4 shrink-0 rounded' />
          </div>
          <div className='flex min-w-0 flex-1 items-center gap-4'>
            <Skeleton className='h-5 w-14 shrink-0' />
            <Skeleton className='h-5 w-24 shrink-0' />
            <Skeleton className='h-5 w-20 shrink-0' />
            <Skeleton className='h-5 w-24 shrink-0' />
            <Skeleton className='h-5 w-20 shrink-0' />
          </div>
        </div>

        <div className='divide-y divide-border/60 border-b border-border/60'>
          {[1, 2, 3, 4, 5].map((planSkeletonId) => (
            <PlanRowSkeleton key={`plan-row-skeleton-${planSkeletonId}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanRowSkeleton() {
  return (
    <div className='flex items-center gap-3 px-2 py-4'>
      <Skeleton className='size-1.5 shrink-0 rounded-full' />

      <div className='min-w-0 flex-1 space-y-1.5'>
        <Skeleton className='h-4 w-64' />
        <Skeleton className='h-3 w-40' />
      </div>

      <Skeleton className='hidden h-3 w-16 shrink-0 md:block' />
      <Skeleton className='hidden h-px w-20 shrink-0 sm:block' />
      <Skeleton className='hidden h-3 w-9 shrink-0 sm:block' />
      <Skeleton className='hidden h-3 w-20 shrink-0 lg:block' />
      <Skeleton className='size-8 shrink-0 rounded-md' />
    </div>
  );
}
