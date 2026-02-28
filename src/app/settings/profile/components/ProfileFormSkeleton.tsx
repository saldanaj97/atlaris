import type { ReactElement } from 'react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the Profile form.
 * Shown while the profile data is loading.
 */
export function ProfileFormSkeleton(): ReactElement {
  return (
    <>
      <Card className="p-6">
        <Skeleton className="mb-4 h-7 w-48" />
        <div className="space-y-4">
          <div>
            <Skeleton className="mb-1 h-4 w-12" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div>
            <Skeleton className="mb-1 h-4 w-12" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </Card>
      <Card className="p-6">
        <Skeleton className="mb-4 h-7 w-40" />
        <div className="space-y-4">
          <div>
            <Skeleton className="mb-1 h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div>
            <Skeleton className="mb-1 h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div>
            <Skeleton className="mb-1 h-4 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </Card>
    </>
  );
}
