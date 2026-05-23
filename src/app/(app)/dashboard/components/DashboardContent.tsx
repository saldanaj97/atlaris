import {
  findActivePlan,
  generateActivities,
} from '@/app/(app)/dashboard/components/activity-utils';
import { ActivityFeedClient } from '@/app/(app)/dashboard/components/ActivityFeedClient';
import { ActivityStreamSidebar } from '@/app/(app)/dashboard/components/ActivityStreamSidebar';
import { ResumeLearningHero } from '@/app/(app)/dashboard/components/ResumeLearningHero';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { ROUTES } from '@/features/navigation/routes';
import { listDashboardPlanSummaries } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

/**
 * Async component that fetches user plan data and renders dashboard content.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function DashboardContent(): Promise<JSX.Element> {
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
      {/* ResumeLearningHero - only shown if there's an active plan */}
      {activePlan && (
        <section aria-label="Resume learning" className="mb-6">
          <ResumeLearningHero plan={activePlan} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Client island - only filter logic */}
        <ActivityFeedClient activities={activities} />

        {/* Sidebar - server rendered */}
        <ActivityStreamSidebar activePlan={activePlan} />
      </div>
    </>
  );
}

/**
 * Skeleton for the dashboard content.
 * Shown while the async component is loading.
 */
export function DashboardContentSkeleton(): JSX.Element {
  return (
    <>
      {/* ResumeLearningHero skeleton */}
      <section aria-label="Resume learning loading" className="mb-6">
        <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-linear-to-br from-primary/20 via-accent/20 to-primary-dark/20 p-6 shadow-lg">
          {/* Top row: label (left) and circular progress (right) */}
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-4 w-28 bg-white/30" />
            {/* Circular progress skeleton */}
            <Skeleton className="size-16 rounded-full bg-white/30" />
          </div>

          {/* Bottom row: badges + title + description */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              {/* Badge skeletons */}
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-20 rounded-full bg-white/30" />
                <Skeleton className="h-6 w-16 rounded-full bg-white/30" />
                <Skeleton className="h-6 w-14 rounded-full bg-white/30" />
                <Skeleton className="h-6 w-24 rounded-full bg-white/30" />
              </div>
              {/* Title skeleton */}
              <Skeleton className="h-9 w-64 bg-white/30 md:w-80" />
              {/* Description skeleton */}
              <Skeleton className="h-5 w-full max-w-md bg-white/30" />
            </div>

            {/* Bottom right: Up Next and Continue Learning */}
            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-3 sm:gap-4">
              <Skeleton className="h-5 w-40 bg-white/30" />
              <Skeleton className="h-10 w-40 rounded-lg bg-white/30" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity Feed skeleton - lg:col-span-2 */}
        <div className="lg:col-span-2">
          {/* Filter tabs skeleton */}
          <div className="mb-6 flex items-center gap-3">
            <Skeleton className="h-9 w-16 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>

          {/* Activity cards skeleton */}
          <div className="space-y-4">
            {[1, 2, 3, 4].map((activitySkeletonId) => (
              <Surface
                key={`dashboard-activity-skeleton-${activitySkeletonId}`}
              >
                <div className="flex gap-4">
                  {/* Icon skeleton */}
                  <Skeleton className="size-10 flex-shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full max-w-sm" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              </Surface>
            ))}
          </div>
        </div>

        {/* Sidebar skeleton */}
        <aside className="flex w-full flex-col gap-4">
          <Surface>
            <div className="flex flex-col items-center py-6 text-center">
              <Skeleton className="mb-4 size-12 rounded-full" />
              <Skeleton className="mb-2 h-5 w-40" />
              <Skeleton className="mb-4 h-4 w-56" />
              <Skeleton className="h-10 w-28 rounded-lg" />
            </div>
          </Surface>
        </aside>
      </div>
    </>
  );
}
