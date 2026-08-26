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
      <header className='mb-6 space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-28' />
        </div>
        <div className='space-y-2'>
          <Skeleton className='h-8 w-full max-w-2xl' />
          <Skeleton className='h-4 w-full max-w-md' />
        </div>
      </header>

      <section className='mb-10'>
        <div className='rounded-2xl border border-panel-border bg-panel p-5 sm:p-6'>
          <div className='grid gap-6 sm:grid-cols-[minmax(0,1fr)_9rem] sm:gap-8'>
            <div className='min-w-0'>
              <Skeleton className='mb-3 h-3 w-44 bg-secondary' />
              <Skeleton className='h-8 w-full max-w-lg' />
            </div>
            <div className='flex items-end justify-between gap-6 border-t border-border/50 pt-4 sm:block sm:border-t-0 sm:border-l sm:pl-7 sm:text-right'>
              <div className='space-y-2 sm:ml-auto sm:w-fit'>
                <Skeleton className='h-3 w-16 bg-secondary' />
                <Skeleton className='h-10 w-20' />
              </div>
              <Skeleton className='h-3 w-28 bg-muted sm:mt-2 sm:ml-auto' />
            </div>
          </div>
          <div className='mt-6 grid divide-y divide-border/40 border-t border-border/50 pt-1 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:pt-5'>
            {[1, 2, 3].map((statSkeletonId) => (
              <StatCellSkeleton key={`plan-stat-skeleton-${statSkeletonId}`} />
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className='mb-6 flex items-baseline justify-between border-b border-border pb-2'>
          <Skeleton className='h-3 w-44 bg-secondary' />
          <Skeleton className='h-3 w-20' />
        </div>

        <div className='space-y-4'>
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
