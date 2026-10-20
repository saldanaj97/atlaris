import { LoadingStatus } from '@/components/ui/loading-status';
import { Skeleton } from '@/components/ui/skeleton';

function BillingPlanRowSkeleton() {
  return (
    <div className='flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0'>
      <Skeleton className='h-5 w-28' />
      <Skeleton className='h-5 w-24' />
    </div>
  );
}

/**
 * Skeleton for the billing sentence, plan card and status/billing-date ledger rows.
 */
export function BillingPlanSkeleton() {
  return (
    <div className='space-y-4'>
      <LoadingStatus>Loading billing</LoadingStatus>
      <Skeleton className='h-[22px] w-64 max-w-full bg-muted' />
      <div className='flex flex-col gap-3 rounded-lg border border-panel-border bg-panel/70 p-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex min-w-0 items-center gap-3'>
          <Skeleton className='size-10 shrink-0 rounded-lg bg-secondary' />
          <Skeleton className='h-5 w-28' />
        </div>
        <Skeleton className='h-8 w-24 rounded-[8px]' />
      </div>
      <div className='divide-y divide-border/40 dark:divide-border/30'>
        <BillingPlanRowSkeleton />
        <BillingPlanRowSkeleton />
      </div>
    </div>
  );
}

function UsageMeterSkeleton() {
  return (
    <div className='py-3.5'>
      <div className='mb-1.5 flex items-center justify-between'>
        <Skeleton className='h-4 w-32' />
        <Skeleton className='h-4 w-12' />
      </div>
      <Skeleton className='h-1 w-full rounded-full' />
    </div>
  );
}

/**
 * Skeleton for usage ledger rows.
 */
export function UsageSkeleton() {
  return (
    <>
      <LoadingStatus>Loading usage</LoadingStatus>
      <UsageMeterSkeleton />
      <UsageMeterSkeleton />
    </>
  );
}
