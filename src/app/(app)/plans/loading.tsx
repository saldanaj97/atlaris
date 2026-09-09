import { PlansContentSkeleton } from '@/app/(app)/plans/components/PlansContentSkeleton';
import { PlansHero } from '@/app/(app)/plans/components/PlansHero';
import { Skeleton } from '@/components/ui/skeleton';

export default function PlansLoading() {
  return (
    <>
      <PlansHero>
        <Skeleton className='h-10 w-28' />
        <div className='flex items-center gap-3'>
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-6 w-24 rounded-full' />
        </div>
      </PlansHero>
      <PlansContentSkeleton />
    </>
  );
}
