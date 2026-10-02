import { LoadingStatus } from '@/components/ui/loading-status';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the model selection ledger section, shaped like the Starter
 * layout: note, model select, model detail card and two full-width buttons.
 */
export function ModelSelectionCardSkeleton() {
  return (
    <div className='py-3.5 first:pt-0 last:pb-0'>
      <LoadingStatus>Loading model selection</LoadingStatus>
      <Skeleton className='mb-4 h-9 w-full max-w-md bg-muted' />
      <div className='space-y-4'>
        <div className='space-y-2'>
          <Skeleton className='h-5 w-32 bg-muted' />
          <Skeleton className='h-10 w-full rounded-[8px]' />
        </div>
        <Skeleton className='h-44 w-full rounded-xl' />
        <Skeleton className='h-10 w-full rounded-[8px]' />
        <Skeleton className='h-10 w-full rounded-[8px]' />
      </div>
    </div>
  );
}
