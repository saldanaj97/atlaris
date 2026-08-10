import type { ReactElement } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for profile ledger rows.
 */
export function ProfileFormSkeleton(): ReactElement {
  return (
    <>
      <div className='flex items-center justify-between gap-4 py-3.5'>
        <Skeleton className='h-4 w-12' />
        <Skeleton className='h-4 w-32' />
      </div>
      <div className='flex items-center justify-between gap-4 py-3.5'>
        <Skeleton className='h-4 w-12' />
        <Skeleton className='h-4 w-40' />
      </div>
      <div className='flex items-center justify-between gap-4 py-3.5'>
        <Skeleton className='h-4 w-24' />
        <Skeleton className='h-4 w-28' />
      </div>
    </>
  );
}
