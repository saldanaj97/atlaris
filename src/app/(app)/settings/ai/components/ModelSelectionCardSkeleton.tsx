import type { JSX } from 'react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the Model Selection card.
 * Shown while the async component is loading.
 */
export function ModelSelectionCardSkeleton(): JSX.Element {
  return (
    <Card className="p-6">
      <Skeleton className="mb-4 h-6 w-36" />

      {/* Model selector dropdown skeleton */}
      <Skeleton className="mb-4 h-10 w-full rounded-md" />

      {/* Model cards skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((modelSkeletonId) => (
          <Card
            key={`model-skeleton-${modelSkeletonId}`}
            className="rounded-lg border p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div>
                  <Skeleton className="mb-1 h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </Card>
        ))}
      </div>

      <Skeleton className="mt-4 h-4 w-56" />
    </Card>
  );
}
