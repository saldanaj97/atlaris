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
import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { ROUTES } from '@/features/navigation/routes';
import { listPlansPageSummaries } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

/**
 * Async component that fetches usage data and renders the plan count badge.
 * Wrapped in its own Suspense boundary by the parent page.
 */
export async function PlanCountBadgeContent(): Promise<JSX.Element | null> {
  const snapshot = await requestBoundary.component(async ({ actor, db }) =>
    getBillingAccountSnapshot({ userId: actor.id, dbClient: db }),
  );

  if (!snapshot) return null;

  return (
    <PlanCountBadge
      usage={{
        tier: snapshot.usage.tier,
        activePlans: snapshot.usage.activePlans,
        regenerations: snapshot.usage.regenerations,
        exports: snapshot.usage.exports,
      }}
    />
  );
}

/**
 * Async component that fetches user plans and renders content.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function PlansContent(): Promise<JSX.Element> {
  const result = await requestBoundary.component(async ({ actor, db }) => {
    const [summaries, snapshot] = await Promise.all([
      listPlansPageSummaries({ userId: actor.id, dbClient: db }),
      getBillingAccountSnapshot({ userId: actor.id, dbClient: db }),
    ]);
    return { summaries, snapshot };
  });

  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.PLANS.ROOT)}`,
    );
  }

  const { summaries, snapshot } = result;
  const referenceTimestamp = new Date().toISOString();

  if (!summaries.length) {
    return (
      <section aria-label="No plans found">
        <Empty className="min-h-[20rem] border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>No learning plans yet</EmptyTitle>
            <EmptyDescription>
              Start by describing what you want to learn and we&apos;ll create a
              personalized learning plan with resources and milestones.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="lg">
              <Link href="/plans/new">
                <Plus className="h-4 w-4" />
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
      usage={
        snapshot
          ? {
              tier: snapshot.usage.tier,
              activePlans: snapshot.usage.activePlans,
              regenerations: snapshot.usage.regenerations,
              exports: snapshot.usage.exports,
            }
          : undefined
      }
    />
  );
}
