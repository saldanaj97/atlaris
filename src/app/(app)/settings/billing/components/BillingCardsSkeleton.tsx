import { Skeleton } from '@/components/ui/skeleton';

function BillingPlanRowSkeleton() {
  return (
    <div className='flex items-center justify-between gap-4 py-3.5'>
      <Skeleton className='h-4 w-28' />
      <Skeleton className='h-4 w-24' />
    </div>
  );
}

/**
 * Skeleton for billing plan ledger rows.
 */
export function BillingPlanSkeleton() {
  return (
    <>
      <BillingPlanRowSkeleton />
      <BillingPlanRowSkeleton />
      <BillingPlanRowSkeleton />
      <BillingPlanRowSkeleton />
    </>
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
      <UsageMeterSkeleton />
      <UsageMeterSkeleton />
      <UsageMeterSkeleton />
      <UsageMeterSkeleton />
    </>
  );
}

/**
 * @deprecated Use BillingPlanSkeleton and UsageSkeleton.
 */
export function BillingCardsSkeleton() {
  return (
    <>
      <BillingPlanSkeleton />
      <UsageSkeleton />
    </>
  );
}
