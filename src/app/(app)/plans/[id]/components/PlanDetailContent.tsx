import { PlanDetailPageError } from './Error';
import { PlanDetails } from './PlanDetails';
import { getPlanError, isPlanSuccess } from '@/app/(app)/plans/[id]/helpers';
import { loadPlanForPage } from '@/app/(app)/plans/[id]/plan-page-data';
import { FreeAccessPlanSelector } from '@/app/(app)/plans/components/FreeAccessPlanSelector';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/features/navigation/routes';
import { logger } from '@/lib/logging/logger';
import { redirect } from 'next/navigation';

interface PlanDetailContentProps {
  planId: string;
}

/**
 * Async component that fetches plan data and renders the appropriate view.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function PlanDetailContent({ planId }: PlanDetailContentProps) {
  const planResult = await loadPlanForPage(planId);

  if (!isPlanSuccess(planResult)) {
    const error = getPlanError(planResult);
    const code = error.code;
    const message = error.message;

    logger.warn({ planId, errorCode: code }, `Plan access denied: ${message}`);

    switch (code) {
      case 'UNAUTHORIZED': {
        const redirectPath = `/plans/${planId}`;
        return redirect(
          `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(redirectPath)}`,
        );
      }

      case 'NOT_FOUND':
        return (
          <PlanDetailPageError message='This plan does not exist or you do not have access to it.' />
        );

      case 'FORBIDDEN':
        return (
          <PlanDetailPageError message='You do not have permission to view this plan.' />
        );

      case 'PLAN_ENTITLEMENT_REQUIRED':
        return (
          <PlanDetailPageError
            message='Upgrade to access this plan.'
            upgradeHref={ROUTES.PRICING}
          />
        );

      case 'FREE_PLAN_SELECTION_REQUIRED':
        return (
          <div className='mx-auto max-w-2xl py-10'>
            <FreeAccessPlanSelector candidates={error.candidates ?? []} />
          </div>
        );

      case 'INTERNAL_ERROR':
        return (
          <PlanDetailPageError message='Something went wrong. Please try again later.' />
        );

      default: {
        const _exhaustive: never = code;
        return (
          <PlanDetailPageError message='Something went wrong. Please try again later.' />
        );
      }
    }
  }

  logger.debug({ planId }, 'Plan detail payload ready for rendering');
  return <PlanDetails plan={planResult.data} />;
}

/**
 * Skeleton for the plan detail content.
 * Shown while the async component is loading.
 */
export function PlanDetailContentSkeleton() {
  return (
    <>
      <header className='mb-5'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-28' />
        </div>
      </header>

      <section
        aria-label='Learning plan loading'
        className='relative overflow-hidden rounded-2xl border border-panel-border bg-panel px-5 py-6 sm:px-7 sm:py-8'
      >
        <div className='max-w-3xl'>
          <Skeleton className='h-3 w-48 bg-secondary' />
          <Skeleton className='mt-4 h-10 w-full max-w-2xl' />
          <Skeleton className='mt-3 h-4 w-full max-w-xl bg-muted' />
          <div className='mt-5 flex flex-wrap gap-3'>
            <Skeleton className='h-10 w-36 bg-primary/35' />
            <Skeleton className='h-10 w-28 bg-secondary' />
          </div>
        </div>
      </section>

      <div className='mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]'>
        <section
          aria-label='Learning path loading'
          className='overflow-hidden rounded-2xl border border-panel-border bg-panel'
        >
          <div className='border-b border-border/60 px-5 py-5 sm:px-6'>
            <Skeleton className='h-3 w-20 bg-secondary' />
            <Skeleton className='mt-2 h-6 w-48' />
            <Skeleton className='mt-2 h-4 w-44 bg-muted' />
          </div>
          <div className='space-y-4 px-3 py-5 sm:px-5'>
            {[1, 2, 3, 4, 5].map((moduleSkeletonId) => (
              <ModuleAccordionSkeleton
                key={`plan-module-skeleton-${moduleSkeletonId}`}
              />
            ))}
          </div>
        </section>

        <aside aria-label='Plan summary loading' className='space-y-4'>
          <div className='rounded-2xl border border-panel-border bg-panel p-5'>
            <div className='flex items-center justify-between gap-3'>
              <Skeleton className='h-5 w-28' />
              <Skeleton className='h-7 w-12' />
            </div>
            <Skeleton className='mt-5 h-2 w-full bg-secondary' />
            <div className='mt-5 grid grid-cols-2 gap-4'>
              <StatCellSkeleton />
              <StatCellSkeleton />
            </div>
          </div>
          <div className='rounded-2xl border border-panel-border bg-panel p-5'>
            <Skeleton className='h-5 w-28' />
            <div className='mt-5 space-y-3 border-t border-border/60 pt-4'>
              {[1, 2, 3, 4].map((detailSkeletonId) => (
                <div
                  key={`plan-detail-skeleton-${detailSkeletonId}`}
                  className='flex items-center justify-between gap-4'
                >
                  <Skeleton className='h-3 w-20 bg-muted' />
                  <Skeleton className='h-3 w-24' />
                </div>
              ))}
            </div>
          </div>
          <div className='rounded-2xl border border-panel-border bg-panel p-5'>
            <Skeleton className='h-5 w-20' />
            <Skeleton className='mt-4 h-20 w-full rounded-lg bg-muted' />
          </div>
        </aside>
      </div>
    </>
  );
}

function StatCellSkeleton() {
  return (
    <div className='py-4 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0'>
      <Skeleton className='mb-2 h-3 w-16 bg-secondary' />
      <Skeleton className='h-6 w-24' />
      <Skeleton className='mt-1 h-3 w-28 bg-muted' />
    </div>
  );
}

function ModuleAccordionSkeleton() {
  return (
    <Card>
      <CardContent className='p-5'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-4'>
            <Skeleton className='size-10 rounded-full' />
            <div className='space-y-1.5'>
              <Skeleton className='h-5 w-48' />
              <div className='flex items-center gap-3'>
                <Skeleton className='h-3.5 w-16' />
                <Skeleton className='h-3.5 w-20' />
              </div>
            </div>
          </div>
          <div className='flex items-center gap-4'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='size-5' />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
