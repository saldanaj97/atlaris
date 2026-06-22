import type { PlansPageData } from '@/app/(app)/plans/plans-page-data';
import type { PlanListQuery } from '@/features/plans/read-projection/types';

import { PlanCountBadge } from '@/app/(app)/plans/components/PlanCountBadge';
import { PlansList } from '@/app/(app)/plans/components/PlansList';
import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { ROUTES } from '@/features/navigation/routes';
import { Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/**
 * Async component that fetches usage data and renders the plan count badge.
 * Wrapped in its own Suspense boundary by the parent page.
 */
export async function PlanCountBadgeContent({
  dataPromise,
}: {
  dataPromise: Promise<PlansPageData | null>;
}) {
  const result = await dataPromise;
  const usage = result?.usage;

  if (!usage) return null;

  return (
    <PlanCountBadge
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
 * Async component that fetches user plans and renders content.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function PlansContent({
  dataPromise,
  query,
}: {
  dataPromise: Promise<PlansPageData | null>;
  query: PlanListQuery;
}) {
  const result = await dataPromise;
  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.PLANS.ROOT)}`,
    );
  }

  const { plansPage, usage } = result;

  if (
    plansPage.totalSearchResults === 0 &&
    query.search === '' &&
    query.status === 'all'
  ) {
    return (
      <section aria-label='No plans found'>
        <RouteEmptyState
          className='min-h-100 border'
          icon={Sparkles}
          title='No learning plans yet'
          description="Start by describing what you want to learn and we'll create a personalized learning plan with resources and milestones."
          action={
            <Button asChild size='lg'>
              <Link href='/plans/new'>
                <Plus />
                Create your first plan
              </Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <PlansList
      page={plansPage}
      query={query}
      usage={{
        tier: usage.tier,
        activePlans: usage.activePlans,
        regenerations: usage.regenerations,
        exports: usage.exports,
      }}
    />
  );
}
