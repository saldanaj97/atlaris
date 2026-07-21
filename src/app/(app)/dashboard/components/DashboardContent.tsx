import {
  findActivePlan,
  generateActivities,
} from '@/app/(app)/dashboard/components/activity-utils';
import { ActivityFeedClient } from '@/app/(app)/dashboard/components/ActivityFeedClient';
import { ResumeLearningHero } from '@/app/(app)/dashboard/components/ResumeLearningHero';
import { StartTonightCard } from '@/app/(app)/dashboard/components/StartTonightCard';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className='relative space-y-8'>
      {/* soft + accent ambient — soft (#3b2135 / secondary) and peach wash */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 -top-6 h-56 overflow-hidden'
      >
        <div className='absolute top-0 right-[8%] size-40 rounded-full bg-secondary/45 blur-3xl' />
        <div className='absolute bottom-0 left-[6%] size-32 rounded-full bg-primary/10 blur-3xl' />
      </div>

      <div className='relative'>
        {activePlan ? (
          <section aria-label='Resume learning'>
            <ResumeLearningHero plan={activePlan} />
          </section>
        ) : (
          <section aria-label='Start learning'>
            <StartTonightCard />
          </section>
        )}
      </div>

      <div className='relative'>
        <ActivityFeedClient activities={activities} />
      </div>
    </div>
  );
}

/**
 * Skeleton for the dashboard content.
 * Shown while the async component is loading.
 */
export function DashboardContentSkeleton() {
  return (
    <div className='space-y-8'>
      <section aria-label='Resume learning loading'>
        <div className='rounded-[1.75rem] border border-panel-border bg-panel p-6 sm:p-7'>
          <Skeleton className='mb-4 h-3 w-32 bg-secondary' />
          <Skeleton className='mb-2 h-8 w-full max-w-md' />
          <Skeleton className='mb-6 h-4 w-full max-w-sm bg-muted' />
          <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <Skeleton className='h-2 w-full max-w-md rounded-full bg-secondary' />
            <Skeleton className='h-9 w-36 rounded-full bg-primary/40' />
          </div>
        </div>
      </section>

      <section aria-label='Recent activity loading'>
        <Skeleton className='mb-4 h-5 w-36' />
        <div className='space-y-3'>
          {[1, 2, 3, 4].map((id) => (
            <div
              key={`dashboard-activity-skeleton-${id}`}
              className='flex items-center gap-3 rounded-xl border border-panel-border bg-panel px-4 py-3.5'
            >
              <Skeleton className='size-5 shrink-0 rounded-full bg-muted' />
              <div className='min-w-0 flex-1 space-y-2'>
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-3 w-28 bg-muted' />
              </div>
              <Skeleton className='h-3 w-16 bg-secondary' />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
