import type { JSX } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { withServerComponentContext } from '@/lib/api/auth';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getDb } from '@/lib/db/runtime';
import { getUsageSummary } from '@/lib/stripe/usage';
import { Plus, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PlanCountBadge } from '@/app/plans/components/PlanCountBadge';
import { PlansList } from '@/app/plans/components/PlansList';

/**
 * Async component that fetches usage data and renders the plan count badge.
 * Wrapped in its own Suspense boundary by the parent page.
 */
export async function PlanCountBadgeContent(): Promise<JSX.Element | null> {
  const result = await withServerComponentContext(async (user) => {
    const db = getDb();
    const usage = await getUsageSummary(user.id, db);
    return { usage };
  });

  if (!result) return null;

  return (
    <PlanCountBadge
      usage={{
        tier: result.usage.tier,
        activePlans: result.usage.activePlans,
        regenerations: result.usage.regenerations,
        exports: result.usage.exports,
      }}
    />
  );
}

/**
 * Async component that fetches user plans and renders content.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function PlansContent(): Promise<JSX.Element> {
  const result = await withServerComponentContext(async (user) => {
    const db = getDb();
    const [summaries, usage] = await Promise.all([
      getPlanSummariesForUser(user.id, db),
      getUsageSummary(user.id, db),
    ]);
    return { summaries, usage };
  });

  if (!result) {
    redirect('/auth/sign-in');
  }

  const { summaries, usage } = result;
  const referenceTimestamp = new Date().toISOString();

  if (!summaries.length) {
    return (
      <>
        {/* Disabled search bar for empty state */}
        <div className="border-border bg-muted-foreground/5 dark:bg-foreground/5 mb-8 flex w-full items-center gap-3 rounded-xl border px-4 py-3 opacity-50">
          <Search className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground flex-1 text-sm">
            Search plans...
          </span>
        </div>

        {/* Empty state content */}
        <section
          className="flex min-h-[50vh] flex-col items-center justify-center text-center"
          aria-label="No plans found"
        >
          <div className="bg-primary/10 mb-6 flex h-16 w-16 items-center justify-center rounded-full">
            <Sparkles className="text-primary h-8 w-8" />
          </div>
          <h2>No learning plans yet</h2>
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
      </>
    );
  }

  return (
    <PlansList
      summaries={summaries}
      referenceTimestamp={referenceTimestamp}
      usage={{
        tier: usage.tier,
        activePlans: usage.activePlans,
        regenerations: usage.regenerations,
        exports: usage.exports,
      }}
    />
  );
}

/**
 * Skeleton for the plans content (search, filters, list).
 * Header title and button are static and rendered by the page.
 */
export function PlansContentSkeleton() {
  return (
    <>
      {/* Search Bar skeleton */}
      <div className="border-border bg-muted-foreground/5 dark:bg-foreground/5 mb-8 flex w-full items-center gap-3 rounded-xl border px-4 py-3">
        <Search className="text-muted-foreground h-4 w-4" />
        <Skeleton className="h-5 w-48" />
      </div>

      {/* Filters Bar skeleton */}
      <div className="border-border mb-6 flex items-center gap-4 border-b pb-4">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>

      {/* Plans List skeleton */}
      <div className="space-y-1">
        {[1, 2, 3, 4, 5].map((planSkeletonId) => (
          <PlanRowSkeleton key={`plan-row-skeleton-${planSkeletonId}`} />
        ))}
      </div>
    </>
  );
}

function PlanRowSkeleton() {
  return (
    <div className="group flex cursor-pointer items-center gap-4 rounded-xl border border-transparent bg-transparent p-4 transition-all hover:border-white/20 hover:bg-white/5">
      {/* Status indicator skeleton */}
      <Skeleton className="h-2.5 w-2.5 flex-shrink-0 rounded-full" />

      {/* Plan info skeleton */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-5 w-64" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      </div>

      {/* Progress bar skeleton */}
      <div className="flex w-32 flex-shrink-0 items-center gap-2">
        <Skeleton className="h-1.5 flex-1 rounded-full" />
        <Skeleton className="h-4 w-8" />
      </div>

      {/* Timestamp skeleton */}
      <Skeleton className="h-4 w-20 flex-shrink-0" />

      {/* Arrow skeleton */}
      <Skeleton className="h-4 w-4 flex-shrink-0" />
    </div>
  );
}
