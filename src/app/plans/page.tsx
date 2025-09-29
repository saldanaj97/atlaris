import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import PlansList from '@/components/plans/PlansList';
import { PlanListSkeleton } from '@/components/plans/skeletons/PlanListSkeleton';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getPlanSummariesForUser, getUserByClerkId } from '@/lib/db/queries';
import type { PlanSummary } from '@/lib/types/db';

async function PlansPageContent() {
  const userId = await getEffectiveClerkUserId();
  if (!userId) {
    redirect('/sign-in?redirect_url=/plans');
  }

  const user = await getUserByClerkId(userId);
  if (!user) {
    redirect('/plans/new');
  }

  const summaries: PlanSummary[] = await getPlanSummariesForUser(user.id);

  if (!summaries.length) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12">
        <div role="status" aria-live="polite" className="text-center">
          <h1 className="text-3xl font-semibold">Your Plans</h1>
          <p className="text-muted-foreground mt-3 max-w-md">
            You have not created any learning plans yet. Start by describing
            what you want to learn and we will organize the journey for you.
          </p>
          <Button asChild className="mt-6">
            <Link href="/plans/new">Create your first plan</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Your Plans</h1>
        <Button asChild>
          <Link href="/plans/new">New plan</Link>
        </Button>
      </div>
      <PlansList summaries={summaries} />
    </div>
  );
}

export default function PlansPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PlanListSkeleton />}>
        <PlansPageContent />
      </Suspense>
    </ErrorBoundary>
  );
}
