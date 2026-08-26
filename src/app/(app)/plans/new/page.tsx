import type { Metadata } from 'next';

import { CreatePlanPageClient } from '@/app/(app)/plans/new/components/CreatePlanPageClient';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Create Learning Plan | Atlaris',
  description:
    'Create a personalized, time-blocked learning plan from your learning goal.',
};

const SIGN_IN_RETURN_PATH = `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.PLANS.NEW)}`;

export default async function CreateNewPlanPage() {
  const subscriptionTier = await requestBoundary.component(
    async ({ actor }) => actor.subscriptionTier,
  );

  if (!subscriptionTier) {
    redirect(SIGN_IN_RETURN_PATH);
  }

  return (
    <div className='flex flex-col items-center pt-2 sm:pt-4'>
      <CreatePlanPageClient subscriptionTier={subscriptionTier} />
    </div>
  );
}
