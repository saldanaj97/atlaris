import {
  PlansChromeSkeleton,
  PlansContentSkeleton,
} from '@/app/(app)/plans/components/PlansContentSkeleton';
import { PlansHero } from '@/app/(app)/plans/components/PlansHero';

export default function PlansLoading() {
  return (
    <>
      <PlansHero chrome={<PlansChromeSkeleton />} />
      <PlansContentSkeleton />
    </>
  );
}
