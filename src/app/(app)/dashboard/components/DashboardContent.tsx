import {
  findActivePlan,
  generateActivities,
} from '@/app/(app)/dashboard/components/activity-utils';
import { ActivityFeedClient } from '@/app/(app)/dashboard/components/ActivityFeedClient';
import { ActivityFeedScoreboard } from '@/app/(app)/dashboard/components/ActivityFeedScoreboard';
import { ActivityStreamSidebar } from '@/app/(app)/dashboard/components/ActivityStreamSidebar';
import { ResumeLearningHero } from '@/app/(app)/dashboard/components/ResumeLearningHero';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { ROUTES } from '@/features/navigation/routes';
import { listDashboardPlanSummaries } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { redirect } from 'next/navigation';

/**
 * Async component that fetches user plan data and renders dashboard content.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function DashboardContent() {
  const result = await requestBoundary.component(async ({ actor, db }) => {
    const summaries = await listDashboardPlanSummaries({
      userId: actor.id,
      dbClient: db,
    });
    return { summaries };
  });

  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.DASHBOARD)}`,
    );
  }

  const { summaries } = result;
  const activities = generateActivities(summaries);
  const activePlan = findActivePlan(summaries);

  return (
    <>
      {activePlan ? (
        <section aria-label='Resume learning' className='mb-5'>
          <ResumeLearningHero plan={activePlan} />
        </section>
      ) : null}

      <div className='grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]'>
        <div className='min-w-0'>
          <ActivityFeedClient activities={activities} />
        </div>

        <div className='min-w-0 space-y-5 lg:self-start'>
          {activePlan ? null : <ActivityStreamSidebar />}
          <ActivityFeedScoreboard
            summaries={summaries}
            activities={activities}
            activePlan={activePlan}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Skeleton for the dashboard content.
 * Shown while the async component is loading.
 */
export function DashboardContentSkeleton() {
  return (
    <>
      <section aria-label='Resume learning loading' className='mb-6'>
        <Surface padding='comfortable' className='flex flex-col gap-4'>
          <div className='flex items-start justify-between gap-4'>
            <Skeleton className='h-4 w-28' />
            <Skeleton className='size-16 rounded-full' />
          </div>

          <div className='flex flex-wrap items-end justify-between gap-4'>
            <div className='min-w-0 flex-1 space-y-2'>
              <Skeleton className='h-9 w-64 md:w-80' />
              <Skeleton className='h-5 w-full max-w-md' />
            </div>

            <div className='flex flex-shrink-0 flex-wrap items-center justify-end gap-3 sm:gap-4'>
              <Skeleton className='h-5 w-40' />
              <Skeleton className='h-10 w-40 rounded-lg' />
            </div>
          </div>
        </Surface>
      </section>

      <div className='grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]'>
        <div>
          {/* Filter tabs skeleton */}
          <div className='mb-6 flex items-center gap-3'>
            <Skeleton className='h-9 w-16 rounded-lg' />
            <Skeleton className='h-9 w-24 rounded-lg' />
            <Skeleton className='h-9 w-20 rounded-lg' />
          </div>

          {/* Activity cards skeleton */}
          <div className='space-y-4'>
            {[1, 2, 3, 4].map((activitySkeletonId) => (
              <Surface
                key={`dashboard-activity-skeleton-${activitySkeletonId}`}
              >
                <div className='flex gap-4'>
                  {/* Icon skeleton */}
                  <Skeleton className='size-10 flex-shrink-0 rounded-lg' />
                  <div className='min-w-0 flex-1 space-y-2'>
                    <div className='flex items-center justify-between'>
                      <Skeleton className='h-5 w-48' />
                      <Skeleton className='h-4 w-20' />
                    </div>
                    <Skeleton className='h-4 w-full max-w-sm' />
                    <Skeleton className='h-4 w-32' />
                  </div>
                </div>
              </Surface>
            ))}
          </div>
        </div>

        <aside className='flex w-full flex-col gap-4 lg:self-start'>
          <Surface className='border-primary/20'>
            <Skeleton className='mb-4 h-5 w-28' />
            <Skeleton className='h-48 w-full rounded-xl' />
          </Surface>
        </aside>
      </div>
    </>
  );
}
