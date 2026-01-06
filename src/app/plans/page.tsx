import { Button } from '@/components/ui/button';
import { getOrCreateCurrentUserRecord } from '@/lib/api/auth';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getUsageSummary } from '@/lib/stripe/usage';
import { Plus, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PlansList } from './components/PlansList';

import type { PlanSummary } from '@/lib/types/db';

export default async function PlansPage() {
  const user = await getOrCreateCurrentUserRecord();
  if (!user) {
    redirect('/sign-in?redirect_url=/plans');
  }

  const summaries: PlanSummary[] = await getPlanSummariesForUser(user.id);
  const usage = await getUsageSummary(user.id);

  const reachedPlanLimit =
    usage.activePlans.limit !== Infinity &&
    usage.activePlans.current >= usage.activePlans.limit;
  const reachedRegenLimit =
    usage.regenerations.limit !== Infinity &&
    usage.regenerations.used >= usage.regenerations.limit;
  const reachedExportLimit =
    usage.exports.limit !== Infinity &&
    usage.exports.used >= usage.exports.limit;
  const limitsReached =
    reachedPlanLimit || reachedRegenLimit || reachedExportLimit;

  if (!summaries.length) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Empty state header */}
        <header className="mb-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-semibold">Your Plans</h1>
              <span className="bg-muted-foreground/10 text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                {summaries.length}
              </span>
            </div>
            <Button asChild>
              <Link href="/plans/new">
                <Plus className="h-4 w-4" />
                New Plan
              </Link>
            </Button>
          </div>

          {/* Disabled search bar */}
          <div className="border-border bg-muted-foreground/5 flex w-full items-center gap-3 rounded-xl border px-4 py-3 opacity-50">
            <Search className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground flex-1 text-sm">
              Search plans or type a command...
            </span>
          </div>
        </header>

        {/* Empty state content */}
        <section
          className="flex min-h-[50vh] flex-col items-center justify-center text-center"
          aria-label="No plans found"
        >
          <div className="bg-primary/10 mb-6 flex h-16 w-16 items-center justify-center rounded-full">
            <Sparkles className="text-primary h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold">No learning plans yet</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            Start by describing what you want to learn and we&apos;ll create a
            personalized learning plan with resources and milestones.
          </p>
          <Button asChild className="mt-6" size="lg">
            <Link href="/plans/new">
              <Plus className="h-4 w-4" />
              Create your first plan
            </Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PlansList
        summaries={summaries}
        limitsReached={limitsReached}
        usage={{
          tier: usage.tier,
          activePlans: usage.activePlans,
          regenerations: usage.regenerations,
          exports: usage.exports,
        }}
      />
    </div>
  );
}
