import {
  findActivePlan,
  generateActivities,
  getDashboardGreeting,
} from '@/app/(app)/dashboard/components/activity-utils';
import { ActivityFeed } from '@/app/(app)/dashboard/components/ActivityFeed';
import { ResumeLearningHero } from '@/app/(app)/dashboard/components/ResumeLearningHero';
import { StartTonightCard } from '@/app/(app)/dashboard/components/StartTonightCard';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/features/navigation/routes';
import { formatMinutes } from '@/features/plans/formatters';
import { listDashboardPlanSummaries } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { redirect } from 'next/navigation';

const PLACEHOLDER_WEEKLY_MINUTES = 150;

function WeeklyPace({ weeklyHours }: { weeklyHours?: number }) {
  if (!weeklyHours) {
    return (
      <aside className='animate-dashboard-unfold h-full rounded-2xl border border-panel-border bg-panel p-6 text-panel-foreground [--dashboard-entry-x:0.75rem] [animation-delay:80ms] motion-reduce:animate-none sm:p-7'>
        <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
          This week
        </p>
        <h2 className='mt-6 text-xl font-semibold text-foreground'>
          No pace set yet
        </h2>
        <p className='mt-2 text-sm text-muted-foreground'>
          Your weekly learning pace will appear with an active plan.
        </p>
      </aside>
    );
  }

  const targetMinutes = weeklyHours * 60;
  // TODO: Replace this placeholder when weekly activity totals are projected.
  const completedMinutes = Math.min(PLACEHOLDER_WEEKLY_MINUTES, targetMinutes);
  const remainingMinutes = Math.max(targetMinutes - completedMinutes, 0);
  const percent = Math.round((completedMinutes / targetMinutes) * 100);

  return (
    <aside className='animate-dashboard-unfold h-full rounded-2xl border border-panel-border bg-panel p-6 text-panel-foreground [--dashboard-entry-x:0.75rem] [animation-delay:80ms] motion-reduce:animate-none sm:p-7'>
      <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
        This week
      </p>

      <div className='mt-8'>
        <p className='text-3xl font-semibold text-foreground tabular-nums'>
          {formatMinutes(completedMinutes)}
        </p>
        <p className='mt-1 text-sm text-muted-foreground'>
          of {formatMinutes(targetMinutes)} planned
        </p>
      </div>

      <div className='mt-6'>
        <div
          className='h-1.5 overflow-hidden rounded-full bg-muted'
          role='progressbar'
          aria-label='Weekly learning pace'
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className='animate-dashboard-trace h-full origin-left rounded-full bg-primary [animation-delay:340ms] motion-reduce:animate-none'
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className='mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground'>
          <span>{percent}% of plan</span>
          <span className='tabular-nums'>
            {remainingMinutes > 0
              ? `${formatMinutes(remainingMinutes)} remaining`
              : 'Weekly pace met'}
          </span>
        </div>
      </div>

      <p className='mt-8 border-t border-border/50 pt-4 text-xs leading-relaxed text-muted-foreground'>
        A steady pace leaves room for the rest of the week.
      </p>
    </aside>
  );
}

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
    return { name: actor.name, summaries };
  });

  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.DASHBOARD)}`,
    );
  }

  const { name, summaries } = result;
  const activities = generateActivities(summaries).slice(0, 8);
  const activePlan = findActivePlan(summaries);

  return (
    <>
      <PageHeader
        title='Dashboard'
        subtitle={getDashboardGreeting(name, activePlan)}
      />

      <div className='space-y-8'>
        <div className='grid gap-6 md:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.65fr)]'>
          {activePlan ? (
            <section aria-label='Resume learning'>
              <ResumeLearningHero plan={activePlan} />
            </section>
          ) : (
            <section aria-label='Start learning'>
              <StartTonightCard />
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
    <>
      <PageHeader
        title='Dashboard'
        subtitle={<Skeleton className='h-4 w-72 max-w-full bg-muted' />}
      />

      <div className='space-y-8'>
        <div className='grid gap-6 md:grid-cols-[minmax(0,1.55fr)_minmax(16rem,0.65fr)]'>
          <section aria-label='Resume learning loading'>
            <div className='h-full rounded-2xl border border-panel-border bg-panel p-6 sm:p-7'>
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
            </div>
          </section>

          <aside className='rounded-2xl border border-panel-border bg-panel p-6 text-panel-foreground sm:p-7'>
            <Skeleton className='h-3 w-20 bg-secondary' />
            <Skeleton className='mt-8 h-9 w-28' />
            <Skeleton className='mt-2 h-4 w-32 bg-muted' />
            <Skeleton className='mt-6 h-1.5 w-full rounded-full bg-muted' />
            <Skeleton className='mt-3 h-3 w-full bg-muted' />
          </aside>
        </div>

        <section aria-label='Recent activity loading'>
          <div className='overflow-hidden rounded-2xl border border-panel-border bg-panel'>
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
          </div>
        </section>
      </div>
    </>
  );
}
