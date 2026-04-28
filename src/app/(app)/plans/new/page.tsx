import type { Metadata } from 'next';
import type { JSX } from 'react';
import { CreatePlanPageClient } from '@/app/(app)/plans/new/components/CreatePlanPageClient';

export const metadata: Metadata = {
  title: 'Create Learning Plan | Atlaris',
  description:
    'Create a personalized, time-blocked learning plan from your learning goal.',
};

export default async function CreateNewPlanPage(): Promise<JSX.Element> {
  return (
    <div className="flex flex-col items-center pt-6 sm:pt-10">
      <CreatePlanPageClient />
    </div>
  );
}
