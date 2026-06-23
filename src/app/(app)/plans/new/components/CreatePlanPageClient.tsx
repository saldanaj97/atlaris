'use client';

import type React from 'react';

import { AiPlanGenerationPanel } from '@/app/(app)/plans/new/components/AiPlanGenerationPanel';
import { PageHeader } from '@/components/ui/page-header';

export function CreatePlanPageClient(): React.ReactElement {
  return (
    <>
      <PageHeader
        align='center'
        className='mb-6 max-w-3xl'
        title='What do you want to learn?'
        subtitle="Describe your learning goal. We'll create a personalized, time-blocked plan with resources for each session."
      />

      <AiPlanGenerationPanel />
    </>
  );
}
