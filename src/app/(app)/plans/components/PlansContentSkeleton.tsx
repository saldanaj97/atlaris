import {
  ATLAS_CONTROL_CLASS,
  ATLAS_HERO_SURFACE_CLASS,
} from '@/app/(app)/plans/components/plans-atlas-classes';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

/**
 * Skeleton for the plans content (search, filters, list).
 * Header title and button are static and rendered by the page.
 */
export function PlansContentSkeleton() {
  return (
    <div className='space-y-5'>
      <Surface className={cn('space-y-5', ATLAS_HERO_SURFACE_CLASS)}>
        <div className='flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
          <div className='min-w-0 space-y-2'>
            <Skeleton className='h-8 w-64 max-w-full' />
            <Skeleton className='h-4 w-full max-w-xl' />
          </div>
          <div className='grid gap-3 sm:grid-cols-2 lg:min-w-[16rem]'>
            {[1, 2].map((statSkeletonId) => (
              <div
                key={`plans-stat-skeleton-${statSkeletonId}`}
                className='border-l border-border/80 pl-3'
              >
                <Skeleton className='mb-2 h-7 w-10' />
                <Skeleton className='mb-1 h-3 w-20' />
                <Skeleton className='h-3 w-24' />
              </div>
            ))}
          </div>
        </div>
      </Surface>

      <Surface
        padding='compact'
        className={cn('space-y-4', ATLAS_CONTROL_CLASS)}
      >
        <div className='relative'>
          <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
          <Skeleton className='h-11 w-full rounded-md' />
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Skeleton className='h-9 w-24 rounded-lg' />
          <Skeleton className='h-9 w-24 rounded-lg' />
          <Skeleton className='h-9 w-28 rounded-lg' />
          <Skeleton className='h-9 w-24 rounded-lg' />
          <Skeleton className='h-9 w-28 rounded-lg' />
          <Skeleton className='h-9 w-20 rounded-lg' />
        </div>
      </Surface>

      <div className='space-y-2'>
        {[1, 2, 3, 4, 5].map((planSkeletonId) => (
          <PlanRowSkeleton key={`plan-row-skeleton-${planSkeletonId}`} />
        ))}
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
