import {
  PlansChromeSkeleton,
  PlansContentSkeleton,
} from '@/app/(app)/plans/components/PlansContentSkeleton';
import { PlansHero } from '@/app/(app)/plans/components/PlansHero';
import { Skeleton } from '@/components/ui/skeleton';

export default function PlansLoading() {
  return (
    <>
      <PlansHero chrome={<PlansChromeSkeleton />}>
        <Skeleton className='h-10 w-28' />
      </PlansHero>
      <PlansContentSkeleton />
    </>
  );
}
