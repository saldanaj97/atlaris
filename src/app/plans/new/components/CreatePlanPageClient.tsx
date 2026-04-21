'use client';

import type React from 'react';
import { ManualCreatePanel } from '@/app/plans/new/components/ManualCreatePanel';

export function CreatePlanPageClient(): React.ReactElement {
  return (
    <>
      <div className="mb-5 text-center sm:mb-6">
        <h1 className="text-foreground mb-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          What do you want to{' '}
          <span className="gradient-text-symmetric">learn?</span>
        </h1>

        <p className="text-muted-foreground mx-auto max-w-md text-base sm:max-w-xl sm:text-lg">
          Describe your learning goal. We&apos;ll create a personalized,
          time-blocked schedule that syncs to your calendar.
        </p>
      </div>

      <ManualCreatePanel />
    </>
  );
}
