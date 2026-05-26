import type { PlansPageData } from '@/app/(app)/plans/plans-page-data';
import type { JSX } from 'react';

import { PlanCountBadge } from '@/app/(app)/plans/components/PlanCountBadge';
import { PlansList } from '@/app/(app)/plans/components/PlansList';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
}): Promise<JSX.Element | null> {
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
}: {
  dataPromise: Promise<PlansPageData | null>;
}): Promise<JSX.Element> {
  const result = await dataPromise;
  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.PLANS.ROOT)}`,
    );
  }

  const { summaries, usage } = result;
  const referenceTimestamp = new Date().toISOString();

  if (!summaries.length) {
    return (
      <section aria-label='No plans found'>
        <Empty className='min-h-100 border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>No learning plans yet</EmptyTitle>
            <EmptyDescription>
              Start by describing what you want to learn and we&apos;ll create a
              personalized learning plan with resources and milestones.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size='lg'>
              <Link href='/plans/new'>
                <Plus />
                Create your first plan
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </section>
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
