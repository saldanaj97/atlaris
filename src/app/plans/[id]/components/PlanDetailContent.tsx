import { Skeleton } from '@/components/ui/skeleton';
import { logger } from '@/lib/logging/logger';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import { redirect } from 'next/navigation';

import { getPlanForPage } from '../actions';
import { getPlanError, isPlanSuccess } from '../helpers';

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

  // Handle plan access errors with explicit error codes
  if (!isPlanSuccess(planResult)) {
    const error = getPlanError(planResult);
    const code = error.code;
    const message = error.message;

    logger.warn({ planId, errorCode: code }, `Plan access denied: ${message}`);

    switch (code) {
      case 'UNAUTHORIZED':
        // User needs to authenticate - redirect to sign-in
        redirect(`/sign-in?redirect_url=/plans/${encodeURIComponent(planId)}`);

      case 'NOT_FOUND':
        // Plan doesn't exist or user doesn't have access
        return (
          <PlanDetailPageError message="This plan does not exist or you do not have access to it." />
        );

      case 'FORBIDDEN':
        // User is authenticated but explicitly not allowed
        return (
          <PlanDetailPageError message="You do not have permission to view this plan." />
        );

      case 'INTERNAL_ERROR':
      default:
        // Unexpected error - show generic message
        return (
          <PlanDetailPageError message="Something went wrong. Please try again later." />
        );
    }
  }

  // TypeScript now knows planResult.success is true, so data exists
  const planData = planResult.data;
  const formattedPlanDetails = mapDetailToClient(planData);
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
export function PlanDetailContentSkeleton() {
  return (
    <>
      {/* PlanOverviewHeader skeleton */}
      <article className="lg:col-span-2">
        {/* Cover Image Area skeleton */}
        <div className="from-primary/20 via-accent/20 relative mb-6 overflow-hidden rounded-3xl bg-linear-to-br to-rose-500/20 p-8 shadow-2xl">
          <div className="relative z-10 flex min-h-[280px] flex-col justify-between">
            {/* Top row: tags */}
            <div className="flex items-start justify-between">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-20 rounded-full bg-white/30" />
                <Skeleton className="h-6 w-16 rounded-full bg-white/30" />
                <Skeleton className="h-6 w-24 rounded-full bg-white/30" />
              </div>
            </div>

            {/* Bottom: title and subtitle */}
            <div>
              <Skeleton className="mb-2 h-4 w-28 bg-white/30" />
              <Skeleton className="mb-1 h-12 w-full max-w-lg bg-white/30 md:h-14" />
              <Skeleton className="h-6 w-64 bg-white/30" />
            </div>
          </div>

          {/* Progress bar overlay */}
          <div className="absolute right-0 bottom-0 left-0 h-1 bg-black/20">
            <Skeleton className="h-full w-1/3 bg-white/50" />
          </div>
        </div>

        {/* Stats Grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </article>

      {/* PlanTimeline skeleton */}
      <section className="mt-8">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-24" />
        </div>

        {/* Module accordion items skeleton */}
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <ModuleAccordionSkeleton key={i} />
          ))}
        </div>
      </section>
    </>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="mb-1 h-8 w-20" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

function ModuleAccordionSkeleton() {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/30 p-5 shadow-lg backdrop-blur-xl dark:border-stone-800/50 dark:bg-stone-900/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Module number badge skeleton */}
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          </div>
        </div>
        {/* Progress and expand icon */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
