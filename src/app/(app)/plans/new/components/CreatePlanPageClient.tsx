'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';
import type React from 'react';

import { AiPlanGenerationPanel } from '@/app/(app)/plans/new/components/AiPlanGenerationPanel';
import { PageHeader } from '@/components/ui/page-header';

export function CreatePlanPageClient({
  subscriptionTier,
}: {
  subscriptionTier: SubscriptionTier;
}): React.ReactElement {
  return (
    <>
      <PageHeader
        align='center'
        className='mb-5 max-w-3xl'
        title='What do you want to learn?'
        subtitle='Name the goal, your level, and the hours you actually have. Atlaris charts the route.'
      />

      <AiPlanGenerationPanel subscriptionTier={subscriptionTier} />
    </>
  );
}
