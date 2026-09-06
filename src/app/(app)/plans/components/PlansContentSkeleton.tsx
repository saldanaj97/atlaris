import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';

/** Skeleton for the plans status rail, search controls, and card library. */
export function PlansContentSkeleton() {
  return (
    <div className='space-y-6' aria-busy='true' aria-label='Loading plans'>
      <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
        <div className='flex min-w-0 items-center gap-1 overflow-hidden rounded-[12px] border border-panel-border bg-panel p-1'>
          {[1, 2, 3, 4, 5].map((item) => (
            <Skeleton
              key={`status-skeleton-${item}`}
              className='h-10 w-20 shrink-0 rounded-[8px]'
            />
          ))}
        </div>
        <div className='flex items-center gap-2 xl:max-w-[30rem] xl:flex-1'>
          <div className='relative flex-1'>
            <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
            <Skeleton className='h-10 w-full rounded-[8px]' />
          </div>
          <Skeleton className='h-10 w-32 shrink-0 rounded-[8px]' />
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <PlanCardSkeleton key={`plan-card-skeleton-${item}`} />
        ))}
      </div>
    </div>
  );
}

function PlanCardSkeleton() {
  return (
    <div className='overflow-hidden rounded-[12px] border border-panel-border bg-panel'>
      <Skeleton className='aspect-[16/9] w-full rounded-none' />
      <div className='space-y-4 p-4 sm:p-5'>
        <div className='space-y-2'>
          <Skeleton className='h-5 w-3/4' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-2/3' />
        </div>
        <Skeleton className='h-2 w-full' />
        <div className='grid grid-cols-2 gap-4 border-t border-border/70 pt-4'>
          <Skeleton className='h-8 w-20' />
          <Skeleton className='h-8 w-24' />
        </div>
        <Skeleton className='h-10 w-full rounded-[8px]' />
      </div>
    </div>
  );
}
