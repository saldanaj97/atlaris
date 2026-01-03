import Link from 'next/link';
import { redirect } from 'next/navigation';

import PlansList from '@/app/plans/components/PlansList';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
      <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-6 py-12">
        <Card
          className="max-w-md p-8 text-center"
          role="status"
          aria-live="polite"
        >
          <h1 className="text-3xl font-semibold">Your Plans</h1>
          <p className="text-muted-foreground mt-3">
            You have not created any learning plans yet. Start by describing
            what you want to learn and we will organize the journey for you.
          </p>
          <Button asChild className="mt-6">
            <Link href="/plans/new">Create your first plan</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Button asChild variant="default" className="mb-4 gap-2">
        <Link href="/dashboard">
          <ArrowLeft className="h-4" />
          Back to Dashboard
        </Link>
      </Button>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Your Plans</h1>
        <Button asChild>
          <Link href="/plans/new">Create New Plan</Link>
        </Button>
      </div>
      <PlansList summaries={summaries} />
    </div>
  );
}
