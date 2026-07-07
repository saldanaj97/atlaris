import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for the model selection ledger section.
 */
export function ModelSelectionCardSkeleton() {
  return (
    <div className='space-y-4 py-3.5'>
      <Skeleton className='h-3 w-full max-w-md' />
      <Skeleton className='h-10 w-full rounded-md' />
      <Skeleton className='h-24 w-full rounded-xl' />
      <Skeleton className='h-10 w-full rounded-md' />
    </div>
  );
}
