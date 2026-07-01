import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';

/**
 * Skeleton for the plans content (search, filters, list toolbar, list).
 * Header title, usage summary, and New Plan button are rendered by the page.
 */
export function PlansContentSkeleton() {
  return (
    <div className='space-y-5'>
      <div className='space-y-4 border-b border-border/60 pb-5'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='relative min-w-0 sm:max-w-sm sm:flex-1'>
            <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
            <Skeleton className='h-9 w-full rounded-md' />
          </div>
          <Skeleton className='h-9 w-32 shrink-0 self-end rounded-md sm:self-auto' />
        </div>

        <div className='flex gap-1.5 overflow-hidden'>
          <Skeleton className='h-8 w-16 shrink-0 rounded-lg' />
          <Skeleton className='h-8 w-24 shrink-0 rounded-lg' />
          <Skeleton className='h-8 w-20 shrink-0 rounded-lg' />
          <Skeleton className='h-8 w-24 shrink-0 rounded-lg' />
          <Skeleton className='h-8 w-20 shrink-0 rounded-lg' />
        </div>
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-3 w-16' />
          <Skeleton className='h-8 w-20 rounded-md' />
        </div>

        <div className='space-y-2'>
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
    <div className='flex items-center gap-4 rounded-2xl px-5 py-4'>
      {/* Status indicator skeleton */}
      <Skeleton className='size-2.5 shrink-0 rounded-full' />

      {/* Plan info skeleton */}
      <div className='min-w-0 flex-1 space-y-1.5'>
        <Skeleton className='h-5 w-64' />
        <div className='flex items-center gap-3'>
          <Skeleton className='h-3.5 w-20' />
          <Skeleton className='h-3.5 w-24' />
          <Skeleton className='h-3.5 w-16' />
        </div>
      </div>

      {/* Progress bar skeleton */}
      <div className='flex w-32 shrink-0 items-center gap-2'>
        <Skeleton className='h-1.5 flex-1 rounded-full' />
        <Skeleton className='h-4 w-8' />
      </div>

      {/* Timestamp skeleton */}
      <Skeleton className='h-4 w-20 shrink-0' />

      {/* Arrow skeleton */}
      <Skeleton className='size-4 shrink-0' />
    </div>
  );
}
