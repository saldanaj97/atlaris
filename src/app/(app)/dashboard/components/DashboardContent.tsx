import type { ReactNode } from 'react';

import {
  generateActivities,
  getDashboardGreeting,
} from '@/app/(app)/dashboard/components/activity-utils';
import { ActivityFeed } from '@/app/(app)/dashboard/components/ActivityFeed';
import { ResumeLearningHero } from '@/app/(app)/dashboard/components/ResumeLearningHero';
import { StartTonightCard } from '@/app/(app)/dashboard/components/StartTonightCard';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/features/navigation/routes';
import { canCreatePlanOnCurrentTier } from '@/features/plans/policy/entitlement';
import { getDashboardPlanData } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import Image from 'next/image';
import { redirect } from 'next/navigation';

const WEEKLY_PACE_TITLE_ID = 'dashboard-weekly-pace-heading';

/** Decorative dashboard introduction with the same text-safe horizon treatment as other app pages. */
function DashboardHero({ subtitle }: { subtitle: ReactNode }) {
  return (
    <div className='relative isolate overflow-hidden rounded-[12px] border border-panel-border bg-panel'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 hidden dark:block'
      >
        <Image
          src='/artwork/planetary-horizon-desktop.jpg'
          alt=''
          aria-hidden='true'
          width={1672}
          height={640}
          sizes='100vw'
          className='absolute inset-0 hidden size-full object-cover object-[78%_50%] opacity-80 md:block'
        />
        <Image
          src='/artwork/planetary-horizon-mobile.jpg'
          alt=''
          aria-hidden='true'
          width={705}
          height={941}
          sizes='100vw'
          className='absolute inset-y-0 right-0 h-full w-[76%] object-cover object-[68%_42%] opacity-75 md:hidden'
        />
        <div className='absolute inset-0 bg-linear-to-r from-panel via-panel/90 to-panel/20' />
      </div>

      <PageHeader
        title='Dashboard'
        subtitle={subtitle}
        className='relative z-10 mb-0 max-w-2xl px-5 py-7 sm:px-7 sm:py-8 lg:px-9 lg:py-10'
      />
    </div>
  );
}

function WeeklyPace({ weeklyHours }: { weeklyHours?: number }) {
  if (weeklyHours == null) {
    return (
      <Card
        as='aside'
        aria-labelledby={WEEKLY_PACE_TITLE_ID}
        className='h-full p-6 animate-dashboard-unfold [--dashboard-entry-x:0.75rem] [animation-delay:80ms] motion-reduce:animate-none sm:p-7'
      >
        <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
          This week
        </p>
        <h2
          id={WEEKLY_PACE_TITLE_ID}
          className='mt-6 text-xl font-semibold text-foreground'
        >
          No pace set yet
        </h2>
        <p className='mt-2 text-sm text-muted-foreground'>
          Your weekly learning pace will appear with an active plan.
        </p>
      </Card>
    );
  }

  return (
    <Card
      as='aside'
      aria-labelledby={WEEKLY_PACE_TITLE_ID}
      className='h-full p-6 animate-dashboard-unfold [--dashboard-entry-x:0.75rem] [animation-delay:80ms] motion-reduce:animate-none sm:p-7'
    >
      <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
        This week
      </p>

      <div className='mt-8'>
        <p className='text-3xl font-semibold text-foreground tabular-nums'>
          {weeklyHours} hr{weeklyHours === 1 ? '' : 's'} planned
        </p>
        <p className='mt-1 text-sm text-muted-foreground'>Weekly target</p>
      </div>

      <div className='mt-6 border-t border-border/50 pt-4'>
        <h2
          id={WEEKLY_PACE_TITLE_ID}
          className='text-base font-medium text-foreground'
        >
          Progress tracking coming soon
        </h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Completed learning time will appear here once it can be measured.
        </p>
      </div>
    </Card>
  );
}

/**
 * Async component that fetches user plan data and renders dashboard content.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function DashboardContent() {
  const result = await requestBoundary.component(async ({ actor, db }) => {
    const dashboardPlans = await getDashboardPlanData({
      userId: actor.id,
      dbClient: db,
    });
    return {
      name: actor.name,
      ...dashboardPlans,
      canCreatePlan: canCreatePlanOnCurrentTier(actor),
    };
  });

  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.DASHBOARD)}`,
    );
  }

  const { name, summaries, resumePlan: activePlan, canCreatePlan } = result;
  const activities = generateActivities(summaries).slice(0, 8);

  return (
    <>
      <DashboardHero subtitle={getDashboardGreeting(name, activePlan)} />

      <div className='space-y-8'>
        <div className='grid gap-6 md:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.65fr)]'>
          {activePlan ? (
            <section aria-label='Resume learning'>
              <ResumeLearningHero plan={activePlan} />
            </section>
          ) : (
            <section aria-label='Start learning'>
              <StartTonightCard canCreatePlan={canCreatePlan} />
            </section>
          )}

          <WeeklyPace weeklyHours={activePlan?.plan.weeklyHours} />
        </div>

        <div className='animate-dashboard-unfold [animation-delay:170ms] motion-reduce:animate-none'>
          <ActivityFeed activities={activities} />
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
    <section aria-label='Loading dashboard' aria-busy='true'>
      <DashboardHero
        subtitle={<Skeleton className='h-4 w-72 max-w-full bg-muted' />}
      />

      <div className='space-y-8'>
        <div className='grid gap-6 md:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.65fr)]'>
          <section aria-label='Resume learning loading'>
            <Card as='article' className='h-full p-6 sm:p-7'>
              <div className='flex justify-between gap-4'>
                <Skeleton className='h-3 w-28 bg-secondary' />
                <Skeleton className='h-4 w-24 bg-muted' />
              </div>
              <Skeleton className='mt-8 h-8 w-full max-w-md' />
              <Skeleton className='mt-3 h-4 w-full max-w-xs bg-muted' />
              <Skeleton className='mt-8 h-1.5 w-full rounded-full bg-secondary' />
              <div className='mt-8 border-t border-border/50 pt-4'>
                <Skeleton className='h-3 w-40 bg-muted' />
                <Skeleton className='mt-5 h-11 w-28 bg-primary/40' />
              </div>
            </Card>
          </section>

          <Card
            as='aside'
            aria-label='Weekly pace loading'
            className='p-6 sm:p-7'
          >
            <Skeleton className='h-3 w-20 bg-secondary' />
            <Skeleton className='mt-8 h-9 w-28' />
            <Skeleton className='mt-2 h-4 w-32 bg-muted' />
            <Skeleton className='mt-6 h-1.5 w-full rounded-full bg-muted' />
            <Skeleton className='mt-3 h-3 w-full bg-muted' />
          </Card>
        </div>

        <section aria-label='Recent activity loading'>
          <Card as='section' className='gap-0 overflow-hidden p-0'>
            <div className='border-b border-border/60 px-5 py-5 sm:px-6'>
              <Skeleton className='h-6 w-32' />
              <Skeleton className='mt-2 h-4 w-64 bg-muted' />
            </div>
            <div className='divide-y divide-border/50'>
              {[1, 2, 3, 4].map((id) => (
                <div
                  key={`dashboard-activity-skeleton-${id}`}
                  className='grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:px-6'
                >
                  <Skeleton className='size-9 rounded-full bg-secondary' />
                  <div>
                    <Skeleton className='h-3 w-24 bg-muted' />
                    <Skeleton className='mt-2 h-4 w-52' />
                  </div>
                  <Skeleton className='h-3 w-20 bg-secondary' />
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </section>
  );
}
