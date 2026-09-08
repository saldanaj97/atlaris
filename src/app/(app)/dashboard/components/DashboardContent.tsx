import type { ReactNode } from 'react';

import {
  generateActivities,
  getDashboardHeroDescription,
  getDashboardHeroTitle,
} from '@/app/(app)/dashboard/components/activity-utils';
import { ActivityFeed } from '@/app/(app)/dashboard/components/ActivityFeed';
import { LearningRouteCard } from '@/app/(app)/dashboard/components/LearningRouteCard';
import { ResumeLearningHero } from '@/app/(app)/dashboard/components/ResumeLearningHero';
import { StartTonightCard } from '@/app/(app)/dashboard/components/StartTonightCard';
import {
  buildSuggestedNextSteps,
  SuggestedNextSteps,
} from '@/app/(app)/dashboard/components/SuggestedNextSteps';
import { WeeklyPaceCard } from '@/app/(app)/dashboard/components/WeeklyPaceCard';
import { YourProgressCard } from '@/app/(app)/dashboard/components/YourProgressCard';
import { Card } from '@/components/ui/card';
import { SectionOverline } from '@/components/ui/section-overline';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/features/navigation/routes';
import { canCreatePlanOnCurrentTier } from '@/features/plans/policy/entitlement';
import { getDashboardPlanData } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { redirect } from 'next/navigation';

const DASHBOARD_GRID =
  'grid gap-4 md:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.65fr)]';

function DashboardHero({
  title,
  description,
}: {
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <header className='rounded-[12px] border border-panel-border bg-panel px-6 py-5 shadow-sm sm:px-8 sm:py-6'>
      <SectionOverline>Current focus</SectionOverline>
      <h1 className='font-heading mt-2 max-w-3xl text-[28px] leading-[1.15] tracking-[-0.02em] text-balance text-foreground sm:text-[32px]'>
        {title}
      </h1>
      {typeof description === 'string' ? (
        <p className='mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base'>
          {description}
        </p>
      ) : (
        <div className='mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base'>
          {description}
        </div>
      )}
    </header>
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
  const suggestedSteps = buildSuggestedNextSteps({
    resumePlanId: activePlan?.plan.id,
    resumeTopic: activePlan?.plan.topic,
    canCreatePlan,
  });

  return (
    <div className='space-y-4'>
      <DashboardHero
        title={getDashboardHeroTitle(name)}
        description={getDashboardHeroDescription(activePlan)}
      />

      <div className={DASHBOARD_GRID}>
        {activePlan ? (
          <section aria-label='Resume learning'>
            <ResumeLearningHero plan={activePlan} />
          </section>
        ) : (
          <section aria-label='Start learning'>
            <StartTonightCard canCreatePlan={canCreatePlan} />
          </section>
        )}

        <YourProgressCard summaries={summaries} />
      </div>

      {activePlan && activePlan.modules.length > 0 ? (
        <div className={DASHBOARD_GRID}>
          <LearningRouteCard plan={activePlan} />
          <WeeklyPaceCard weeklyHours={activePlan.plan.weeklyHours} />
        </div>
      ) : (
        <div className={DASHBOARD_GRID}>
          <div className='animate-dashboard-unfold [animation-delay:170ms] motion-reduce:animate-none md:col-span-1'>
            <ActivityFeed activities={activities} />
          </div>
          <WeeklyPaceCard weeklyHours={activePlan?.plan.weeklyHours} />
        </div>
      )}

      {activePlan && activePlan.modules.length > 0 ? (
        <div className='animate-dashboard-unfold [animation-delay:170ms] motion-reduce:animate-none'>
          <ActivityFeed activities={activities} />
        </div>
      ) : null}

      <SuggestedNextSteps steps={suggestedSteps} />
    </div>
  );
}

/**
 * Skeleton for the dashboard content.
 * Shown while the async component is loading.
 */
export function DashboardContentSkeleton() {
  return (
    <section aria-label='Loading dashboard' aria-busy='true'>
      <div className='space-y-4'>
        <DashboardHero
          title={<Skeleton className='h-8 w-72 max-w-full' />}
          description={<Skeleton className='h-4 w-80 max-w-full bg-muted' />}
        />

        <div className={DASHBOARD_GRID}>
          <section aria-label='Resume learning loading'>
            <Card as='article' className='h-full p-5 sm:p-6'>
              <Skeleton className='h-6 w-40' />
              <Skeleton className='mt-4 h-6 w-16 rounded-full bg-secondary' />
              <Skeleton className='mt-4 h-7 w-full max-w-md' />
              <Skeleton className='mt-2 h-4 w-full max-w-xs bg-muted' />
              <Skeleton className='mt-6 h-1.5 w-full rounded-full bg-secondary' />
              <div className='mt-5 flex gap-2'>
                <Skeleton className='h-8 w-40 bg-primary/40' />
                <Skeleton className='h-8 w-28 bg-muted' />
              </div>
            </Card>
          </section>

          <Card as='aside' aria-label='Progress loading' className='p-5 sm:p-6'>
            <Skeleton className='h-6 w-32' />
            <Skeleton className='mt-8 h-9 w-20' />
            <Skeleton className='mt-2 h-4 w-28 bg-muted' />
            <Skeleton className='mt-4 h-1.5 w-full rounded-full bg-muted' />
          </Card>
        </div>

        <div className={DASHBOARD_GRID}>
          <Card
            as='section'
            aria-label='Learning route loading'
            className='p-5 sm:p-6'
          >
            <Skeleton className='h-6 w-48' />
            <Skeleton className='mt-2 h-4 w-56 bg-muted' />
            <Skeleton className='mt-6 h-1.5 w-full rounded-full bg-secondary' />
          </Card>
          <Card
            as='aside'
            aria-label='Weekly pace loading'
            className='p-5 sm:p-6'
          >
            <Skeleton className='h-6 w-24' />
            <Skeleton className='mt-8 h-9 w-28' />
            <Skeleton className='mt-2 h-4 w-32 bg-muted' />
          </Card>
        </div>

        <section aria-label='Recent activity loading'>
          <Card as='section' className='gap-0 overflow-hidden p-0'>
            <div className='px-5 py-5 sm:px-6'>
              <Skeleton className='h-6 w-32' />
              <Skeleton className='mt-2 h-4 w-64 bg-muted' />
            </div>
            <div className='divide-y divide-border/50'>
              {[1, 2, 3, 4].map((id) => (
                <div
                  key={`dashboard-activity-skeleton-${id}`}
                  className='grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:px-6'
                >
                  <Skeleton className='size-9 rounded-[8px] bg-secondary' />
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
