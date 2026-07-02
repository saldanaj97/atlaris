import { PlansContentSkeleton } from '@/app/(app)/plans/components/PlansContentSkeleton';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function PlansLoading() {
  return (
    <>
      <PageHeader
        title='Your Plans'
        subtitle='Search, filter, and track your learning plan library.'
        actions={
          <div className='flex items-center gap-2'>
            <Skeleton className='h-6 w-16 rounded-full' />
            <Skeleton className='h-10 w-24 rounded-lg' />
          </div>
        }
      />
      <PlansContentSkeleton />
    </>
  );
}
