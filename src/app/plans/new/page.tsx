import type { Metadata } from 'next';
import type { JSX } from 'react';
import { CreatePlanPageClient } from '@/app/plans/new/components/CreatePlanPageClient';
import { MouseGlowContainer } from '@/app/plans/new/components/MouseGlow';

export const metadata: Metadata = {
  title: 'Create Learning Plan | Atlaris',
  description:
    'Create a personalized, time-blocked learning plan from your learning goal.',
};

export default async function CreateNewPlanPage(): Promise<JSX.Element> {
  return (
    <MouseGlowContainer className="from-accent/30 via-primary/10 to-accent/20 dark:bg-background fixed inset-0 overflow-hidden bg-linear-to-br dark:from-transparent dark:via-transparent dark:to-transparent">
      <div
        className="from-primary/30 to-accent/20 absolute top-20 -left-20 h-96 w-96 rounded-full bg-linear-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />
      <div
        className="from-primary/30 to-accent/20 absolute top-40 -right-20 h-80 w-80 rounded-full bg-linear-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />
      <div
        className="from-primary/20 to-accent/15 absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-linear-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center overflow-y-auto px-4 pt-20 pb-6 sm:px-6 sm:pt-24 sm:pb-8">
        <CreatePlanPageClient />
      </div>
    </MouseGlowContainer>
  );
}
