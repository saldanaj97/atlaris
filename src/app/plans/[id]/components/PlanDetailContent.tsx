import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { getPlanForPage } from '@/app/plans/[id]/actions';
import { getPlanError, isPlanSuccess } from '@/app/plans/[id]/helpers';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/features/navigation/routes';
import { toClientPlanDetail } from '@/features/plans/read-models/detail';
import { logger } from '@/lib/logging/logger';

import { PlanDetailPageError } from './Error';
import { PlanDetails } from './PlanDetails';

interface PlanDetailContentProps {
  planId: string;
}

/**
 * Async component that fetches plan data and renders the appropriate view.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function PlanDetailContent({ planId }: PlanDetailContentProps) {
  const planResult = await getPlanForPage(planId);

  if (!isPlanSuccess(planResult)) {
    const error = getPlanError(planResult);
    const code = error.code;
    const message = error.message;

    logger.warn({ planId, errorCode: code }, `Plan access denied: ${message}`);

    switch (code) {
      case 'UNAUTHORIZED': {
        const redirectPath = `/plans/${planId}`;
        return redirect(
          `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(redirectPath)}`
        );
      }

      case 'NOT_FOUND':
        return (
          <PlanDetailPageError message="This plan does not exist or you do not have access to it." />
        );

      case 'FORBIDDEN':
        return (
          <PlanDetailPageError message="You do not have permission to view this plan." />
        );
      default:
        return (
          <PlanDetailPageError message="Something went wrong. Please try again later." />
        );
    }
  }

  const planData = planResult.data;
  const formattedPlanDetails = toClientPlanDetail(planData);
  if (!formattedPlanDetails) {
    logger.error(
      {
        planId,
        hasPlanData: !!planData,
        planDataKeys: planData ? Object.keys(planData) : [],
      },
      'Failed to map plan details to client format'
    );
    return <PlanDetailPageError message="Failed to load plan details." />;
  }

  return <PlanDetails plan={formattedPlanDetails} />;
}

/**
 * Skeleton for the plan detail content.
 * Shown while the async component is loading.
 */
export function PlanDetailContentSkeleton(): JSX.Element {
  return (
    <>
      <header className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-8 w-full max-w-2xl" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </header>

      <section className="mb-10 space-y-4">
        <Skeleton className="h-6 w-36" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((statSkeletonId) => (
            <StatCardSkeleton key={`plan-stat-skeleton-${statSkeletonId}`} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-24" />
        </div>

        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((moduleSkeletonId) => (
            <ModuleAccordionSkeleton
              key={`plan-module-skeleton-${moduleSkeletonId}`}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="mb-1 h-8 w-20" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

function ModuleAccordionSkeleton() {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-48" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
