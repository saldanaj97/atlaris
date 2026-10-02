import { Card } from '@/components/ui/card';
import { LoadingStatus } from '@/components/ui/loading-status';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton shaped like the create-plan hero, goal form and side note. */
export default function CreatePlanLoading() {
  return (
    <div
      className='flex flex-col items-center pt-2 sm:pt-4'
      aria-busy='true'
      aria-label='Loading plan form'
    >
      <LoadingStatus>Loading plan form</LoadingStatus>
      <div className='flex w-full flex-col gap-4 sm:gap-6'>
        <div className='rounded-lg border border-panel-border bg-panel px-5 py-6 sm:px-8 sm:py-5'>
          <div className='max-w-3xl'>
            <Skeleton className='h-10 w-full max-w-xl' />
            <Skeleton className='mt-2.5 h-6 w-full max-w-xl bg-muted' />
          </div>
        </div>

        <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,40rem)_minmax(16rem,18rem)]'>
          <Card className='gap-0 py-0'>
            <div className='space-y-2 border-b border-border px-5 py-5 sm:px-6'>
              <Skeleton className='h-6 w-28' />
              <Skeleton className='h-4 w-52 bg-muted' />
            </div>
            <div className='space-y-6 px-5 py-5 sm:px-6'>
              <div className='space-y-3'>
                <Skeleton className='h-5 w-56' />
                <Skeleton className='h-24 w-full' />
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                {[1, 2, 3, 4].map((item) => (
                  <Skeleton
                    key={`plan-form-control-skeleton-${item}`}
                    className='h-10 w-full'
                  />
                ))}
              </div>
            </div>
            <div className='flex items-center justify-between gap-4 border-t border-border px-5 py-5 sm:px-6'>
              <Skeleton className='h-4 w-56 bg-muted' />
              <Skeleton className='h-10 w-32 bg-primary/35' />
            </div>
          </Card>

          <Card className='gap-4 p-4 sm:p-6'>
            <div className='space-y-2'>
              <Skeleton className='h-6 w-44' />
              <Skeleton className='h-4 w-full bg-muted' />
            </div>
            <div className='space-y-3'>
              {[1, 2, 3].map((item) => (
                <Skeleton
                  key={`plan-note-skeleton-${item}`}
                  className='h-5 w-full'
                />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
