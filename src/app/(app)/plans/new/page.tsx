import type { Metadata } from 'next';

import { CreatePlanPageClient } from '@/app/(app)/plans/new/components/CreatePlanPageClient';

export const metadata: Metadata = {
  title: 'Create Learning Plan | Atlaris',
  description:
    'Create a personalized, time-blocked learning plan from your learning goal.',
};

export default function CreateNewPlanPage() {
  return (
    <div className='flex flex-col items-center pt-2 sm:pt-4'>
      <CreatePlanPageClient />
    </div>
  );
}
