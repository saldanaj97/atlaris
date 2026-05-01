import type { JSX } from 'react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the billing cards.
 * Shown while the async component is loading.
 */
export function BillingCardsSkeleton(): JSX.Element {
  return (
    <>
      {/* Current Plan Card skeleton */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Skeleton className="mb-1 h-6 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        <div className="mt-4">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </Card>

      {/* Usage Card skeleton */}
      <Card className="p-6">
        <Skeleton className="mb-4 h-6 w-16" />

        <div className="space-y-5">
          {/* Active plans usage */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>

          {/* Regenerations usage */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>

          {/* Exports usage */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
      </Card>
    </>
  );
}
