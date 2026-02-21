import { Skeleton } from '@/components/ui/skeleton';
import { getOrCreateCurrentUserRecord } from '@/lib/api/auth';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { redirect } from 'next/navigation';

import {
  findActivePlan,
  generateActivities,
} from '@/app/dashboard/components/activity-utils';
import { ActivityFeedClient } from './ActivityFeedClient';
import { ActivityStreamSidebar } from './ActivityStreamSidebar';
import { ResumeLearningHero } from './ResumeLearningHero';

/**
 * Async component that fetches user plan data and renders dashboard content.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function DashboardContent() {
  const user = await getOrCreateCurrentUserRecord();
  if (!user) {
    redirect('/sign-in?redirect_url=/dashboard');
  }

  const summaries = await getPlanSummariesForUser(user.id);

  // Server-side computation
  const activities = generateActivities(summaries);
  const activePlan = findActivePlan(summaries);

  return (
    <>
      {/* ResumeLearningHero - only shown if there's an active plan */}
      {activePlan && (
        <section aria-label="Resume learning" className="mb-8">
          <ResumeLearningHero plan={activePlan} />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
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
export function DashboardContentSkeleton() {
  return (
    <>
      {/* ResumeLearningHero skeleton */}
      <section aria-label="Resume learning loading" className="mb-8">
        <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-linear-to-br from-teal-500/20 via-emerald-500/20 to-cyan-500/20 p-6 shadow-lg">
          {/* Top row: label (left) and circular progress (right) */}
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-4 w-28 bg-white/30" />
            {/* Circular progress skeleton */}
            <Skeleton className="h-16 w-16 rounded-full bg-white/30" />
          </div>

          {/* Bottom row: badges + title + description */}
          <div className="mt-auto flex flex-wrap items-end justify-between gap-4">
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

      <div className="grid gap-8 lg:grid-cols-3">
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
              <div
                key={`dashboard-activity-skeleton-${activitySkeletonId}`}
                className="dark:bg-card-background rounded-2xl border border-white/40 bg-black/5 p-5 shadow-lg backdrop-blur-xl dark:border-white/10"
              >
                <div className="flex gap-4">
                  {/* Icon skeleton */}
                  <Skeleton className="h-10 w-10 flex-shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full max-w-sm" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar skeleton */}
        <aside className="flex w-full flex-col gap-4">
          <div className="dark:bg-card-background rounded-2xl border border-white/40 bg-black/5 p-5 shadow-lg backdrop-blur-xl dark:border-white/10">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>

            {/* Events skeleton */}
            <div className="space-y-3">
              {[1, 2, 3].map((eventSkeletonId) => (
                <div
                  key={`dashboard-event-skeleton-${eventSkeletonId}`}
                  className="flex gap-3"
                >
                  <Skeleton className="h-8 w-8 flex-shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5 pb-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>

            {/* Action buttons skeleton */}
            <div className="mt-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
