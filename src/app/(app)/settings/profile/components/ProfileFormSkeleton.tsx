import type { ReactElement } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton for the profile summary and editable name control. */
export function ProfileFormSkeleton(): ReactElement {
  return (
    <div className='space-y-5'>
      <div className='flex min-w-0 items-start gap-4 rounded-xl border border-panel-border bg-panel-muted/30 p-4 sm:p-5'>
        <Skeleton className='size-12 shrink-0 rounded-full' />
        <div className='min-w-0 flex-1 space-y-2'>
          <Skeleton className='h-5 w-32' />
          <Skeleton className='h-4 w-44 max-w-full' />
          <Skeleton className='h-3 w-36 max-w-full' />
        </div>
      </div>
      <Skeleton className='h-3 w-64 max-w-full' />
    </div>
  );
}
