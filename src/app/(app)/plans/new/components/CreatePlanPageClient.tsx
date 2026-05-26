'use client';

import type React from 'react';

import { ManualCreatePanel } from '@/app/(app)/plans/new/components/ManualCreatePanel';
import { PageHeader } from '@/components/ui/page-header';

export function CreatePlanPageClient(): React.ReactElement {
  return (
    <>
      <PageHeader
        align='center'
        className='mb-6 max-w-3xl'
        title='What do you want to learn?'
        subtitle="Describe your learning goal. We'll create a personalized, time-blocked schedule that syncs to your calendar."
      />

      <ManualCreatePanel />
    </>
  );
}
