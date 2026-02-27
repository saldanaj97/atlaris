import type { JSX } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';

/**
 * Skeleton for the plans content (search, filters, list).
 * Header title and button are static and rendered by the page.
 */
export function PlansContentSkeleton(): JSX.Element {
  return (
    <>
      {/* Search Bar skeleton */}
      <div className="border-border bg-muted-foreground/5 dark:bg-foreground/5 mb-8 flex w-full items-center gap-3 rounded-xl border px-4 py-3">
        <Search className="text-muted-foreground h-4 w-4" />
        <Skeleton className="h-5 w-48" />
      </div>

      {/* Filters Bar skeleton */}
      <div className="border-border mb-6 flex items-center gap-4 border-b pb-4">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>

      {/* Plans List skeleton */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((planSkeletonId) => (
          <PlanRowSkeleton key={`plan-row-skeleton-${planSkeletonId}`} />
        ))}
      </div>
    </>
  );
}

function PlanRowSkeleton(): JSX.Element {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-transparent bg-transparent px-5 py-4">
      {/* Status indicator skeleton */}
      <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />

      {/* Plan info skeleton */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-5 w-64" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      </div>

      {/* Progress bar skeleton */}
      <div className="flex w-32 shrink-0 items-center gap-2">
        <Skeleton className="h-1.5 flex-1 rounded-full" />
        <Skeleton className="h-4 w-8" />
      </div>

      {/* Timestamp skeleton */}
      <Skeleton className="h-4 w-20 shrink-0" />

      {/* Arrow skeleton */}
      <Skeleton className="h-4 w-4 shrink-0" />
    </div>
  );
}
