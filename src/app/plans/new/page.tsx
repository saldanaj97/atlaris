import { MouseGlowContainer } from '@/components/effects/MouseGlow';
import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CreatePlanPageClient } from './components/ManualCreatePanel';
import type { CreateMethod } from './components/CreateMethodToggle';

interface CreateNewPlanPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: 'Create Learning Plan | Atlaris',
  description:
    'Create a personalized, time-blocked learning plan from your goal or a PDF.',
};

function resolveMethod(
  methodValue: string | string[] | undefined
): CreateMethod {
  if (Array.isArray(methodValue)) {
    return methodValue[0] === 'pdf' ? 'pdf' : 'manual';
  }
  return methodValue === 'pdf' ? 'pdf' : 'manual';
}

function resolveTopic(
  topicValue: string | string[] | undefined
): string | null {
  if (Array.isArray(topicValue)) {
    return typeof topicValue[0] === 'string' ? topicValue[0] : null;
  }
  return typeof topicValue === 'string' ? topicValue : null;
}

export default async function CreateNewPlanPage({
  searchParams,
}: CreateNewPlanPageProps): Promise<JSX.Element> {
  const resolvedSearchParams = await searchParams;
  const initialMethod = resolveMethod(resolvedSearchParams.method);
  const initialTopic = resolveTopic(resolvedSearchParams.topic);

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

      <div className="relative z-10 flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <CreatePlanPageClient
          initialMethod={initialMethod}
          initialTopic={initialTopic}
        />
      </div>
    </MouseGlowContainer>
  );
}
