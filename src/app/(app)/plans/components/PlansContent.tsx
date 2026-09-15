import type { PlansPageData } from '@/app/(app)/plans/plans-page-data';
import type { PlanListQuery } from '@/features/plans/read-projection/types';

import { EmptyPlansList } from '@/app/(app)/plans/components/EmptyPlansList';
import { FreeAccessPlanSelector } from '@/app/(app)/plans/components/FreeAccessPlanSelector';
import { shouldShowPlansLibraryChrome } from '@/app/(app)/plans/components/plans-library-chrome';
import {
  PlansLibraryToolbar,
  PlansList,
} from '@/app/(app)/plans/components/PlansList';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation/routes';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/**
 * Query-backed filter/search chrome streamed into the plans hero.
 */
export async function PlansLibraryChrome({
  dataPromise,
  query,
}: {
  dataPromise: Promise<PlansPageData | null>;
  query: PlanListQuery;
}) {
  const result = await dataPromise;
  if (!result) return null;
  if (!shouldShowPlansLibraryChrome(result.plansPage, query)) return null;

  return <PlansLibraryToolbar page={result.plansPage} query={query} />;
}

/**
 * Entitlement CTA streamed into the plans hero.
 */
export async function PlansHeaderCreateAction({
  dataPromise,
}: {
  dataPromise: Promise<PlansPageData | null>;
}) {
  const result = await dataPromise;
  if (!result) return null;

  if (result.plansPage.canCreatePlan === false) {
    return (
      <Button asChild variant='cta'>
        <Link href={ROUTES.PRICING}>Upgrade</Link>
      </Button>
    );
  }

  return (
    <Button asChild variant='cta'>
      <Link href={ROUTES.PLANS.NEW}>
        <Plus />
        New Plan
      </Link>
    </Button>
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

  if (plansPage.selectionRequired) {
    return (
      <section aria-label='Choose a Free plan'>
        <FreeAccessPlanSelector
          candidates={plansPage.selectionCandidates ?? []}
        />
      </section>
    );
  }

  if (!shouldShowPlansLibraryChrome(plansPage, query)) {
    return (
      <section aria-label='No plans found'>
        <EmptyPlansList
          canCreatePlan={plansPage.canCreatePlan}
          filterStatus='all'
          isFirstRun
          searchQuery=''
        />
      </section>
    );
  }

  return (
    <PlansList
      key={`${query.search}|${query.status}|${query.sort}|${plansPage.page}`}
      page={plansPage}
      query={query}
    />
  );
}
