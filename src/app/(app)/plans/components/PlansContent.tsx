import type { PlansPageData } from '@/app/(app)/plans/plans-page-data';
import type { PlanListQuery } from '@/features/plans/read-projection/types';

import { EmptyPlansList } from '@/app/(app)/plans/components/EmptyPlansList';
import { PlanCountBadge } from '@/app/(app)/plans/components/PlanCountBadge';
import { PlansList } from '@/app/(app)/plans/components/PlansList';
import { ROUTES } from '@/features/navigation/routes';
import { redirect } from 'next/navigation';

/**
 * Async component that renders the page-header summary: Active/Completed plan
 * counts plus the plan quota badge. Reads from the same page-data promise
 * already awaited by `PlansContent`, so no additional DB calls are made.
 * Wrapped in its own Suspense boundary by the parent page so the static
 * title and New Plan CTA can render immediately.
 */
export async function PlanHeaderSummaryContent({
  dataPromise,
}: {
  dataPromise: Promise<PlansPageData | null>;
}) {
  const result = await dataPromise;
  if (!result) return null;

  const { plansPage, usage } = result;

  return (
    <div className='flex flex-wrap items-center gap-3 sm:gap-4'>
      <div className='flex items-center gap-3 text-sm text-muted-foreground'>
        <span>
          <span className='font-semibold text-foreground tabular-nums'>
            {plansPage.statusCounts.active}
          </span>{' '}
          Active
        </span>
        <span>
          <span className='font-semibold text-foreground tabular-nums'>
            {plansPage.statusCounts.completed}
          </span>{' '}
          Completed
        </span>
      </div>
      <span className='hidden h-4 w-px bg-border sm:block' aria-hidden='true' />
      <PlanCountBadge
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

  const { plansPage } = result;

  if (
    plansPage.totalSearchResults === 0 &&
    query.search === '' &&
    query.status === 'all'
  ) {
    return (
      <section aria-label='No plans found'>
        <EmptyPlansList filterStatus='all' isFirstRun searchQuery='' />
      </section>
    );
  }

  return <PlansList page={plansPage} query={query} />;
}
