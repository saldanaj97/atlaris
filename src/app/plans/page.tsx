import Link from 'next/link';
import { redirect } from 'next/navigation';

import PlansList from '@/components/plans/PlansList';
import { Button } from '@/components/ui/button';
import { getOrCreateCurrentUserRecord } from '@/lib/api/auth';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import type { PlanSummary } from '@/lib/types/db';
import { ArrowLeft } from 'lucide-react';

export default async function PlansPage() {
  const user = await getOrCreateCurrentUserRecord();
  if (!user) {
    redirect('/sign-in?redirect_url=/plans');
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
    <div className="container mx-auto py-8">
      <Link href="/dashboard">
        <Button variant="neutral" className="mb-4 space-x-2">
          <ArrowLeft className="h-4" />
          <p>Back to Dashboard</p>
        </Button>
      </Link>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-main-foreground text-3xl font-bold">Your Plans</h1>
        <Button asChild>
          <Link href="/plans/new">Create New Plan</Link>
        </Button>
      </div>
      <PlansList summaries={summaries} />
    </div>
  );
}
