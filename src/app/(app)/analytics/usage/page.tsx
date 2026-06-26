import type { Metadata } from 'next';

import {
  buildUsageAnalyticsModel,
  type UsageAnalyticsModel,
  type UsageAnalyticsPlanRow,
  type UsageAnalyticsWeekRow,
} from './usage-analytics-model';
import { UsageAnalyticsTimezoneSync } from './usage-analytics-timezone-sync';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/metric-card';
import { PageHeader } from '@/components/ui/page-header';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { Surface } from '@/components/ui/surface';
import { ROUTES } from '@/features/navigation/routes';
import { formatMinutes } from '@/features/plans/formatters';
import { listUsageAnalyticsPlanSummaries } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { getLearningActivityEventsForUser } from '@/lib/db/queries/tasks';
import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  Clock,
  Flame,
  ListChecks,
  Plus,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Usage Analytics | Atlaris',
  description:
    'Review current completion progress and estimated completed learning time across your plans.',
  openGraph: {
    title: 'Usage Analytics | Atlaris',
    description:
      'Review current completion progress and estimated completed learning time across your plans.',
    url: '/analytics/usage',
    images: ['/og-default.jpg'],
  },
};

const SIGN_IN_RETURN_PATH = `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.ANALYTICS.USAGE)}`;
const ESTIMATED_TIME_HELPER =
  'Based on estimates for tasks currently marked complete. This is not recorded study time.';

export default async function UsageAnalyticsPage() {
  const result = await requestBoundary.component(async ({ actor, db }) => {
    const [summaries, activityEvents] = await Promise.all([
      listUsageAnalyticsPlanSummaries({
        userId: actor.id,
        dbClient: db,
      }),
      getLearningActivityEventsForUser(actor.id, db),
    ]);

    return buildUsageAnalyticsModel(summaries, {
      activityEvents,
      analyticsTimezone: actor.analyticsTimezone,
    });
  });

  if (!result) {
    redirect(SIGN_IN_RETURN_PATH);
  }

  return <UsageAnalyticsView model={result} />;
}

function UsageAnalyticsView({ model }: { model: UsageAnalyticsModel }) {
  return (
    <>
      <UsageAnalyticsTimezoneSync analyticsTimezone={model.analyticsTimezone} />
      <PageHeader
        title='Usage'
        subtitle='Current completion progress and estimated completed learning time from your plans.'
      />

      {model.planCount === 0 ? (
        <div className='space-y-6'>
          <NoPlansState />
          <HistoricalAnalyticsSection model={model} />
        </div>
      ) : (
        <AnalyticsContent model={model} />
      )}
    </>
  );
}

function AnalyticsContent({ model }: { model: UsageAnalyticsModel }) {
  return (
    <div className='space-y-6'>
      <section
        aria-label='Usage analytics summary'
        className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
      >
        <MetricCard
          icon={<ListChecks aria-hidden />}
          label='Tasks complete'
          value={`${model.completedTasks}/${model.totalTasks}`}
          sublabel={`${model.taskCompletionPercent}% complete`}
        />
        <MetricCard
          icon={<BookOpenCheck aria-hidden />}
          label='Modules complete'
          value={`${model.completedModules}/${model.totalModules}`}
          sublabel={`${model.moduleCompletionPercent}% complete`}
        />
        <MetricCard
          icon={<Clock aria-hidden />}
          label='Estimated completed learning time'
          value={formatMinutes(model.completedMinutes)}
          sublabel='From completed task estimates'
        />
        <MetricCard
          icon={<BarChart3 aria-hidden />}
          label='Total estimated plan time'
          value={formatMinutes(model.totalMinutes)}
          sublabel={`${model.planCount} ${model.planCount === 1 ? 'plan' : 'plans'}`}
        />
      </section>
      <p className='text-sm leading-6 text-muted-foreground'>
        {ESTIMATED_TIME_HELPER}
      </p>

      {model.completedTasks === 0 ? <NoCompletedWorkState /> : null}

      <HistoricalAnalyticsSection model={model} />

      <PlanCompletionSection plans={model.plans} />

      {model.history.hasActivity ? (
        <PlanActivitySection plans={model.plans} />
      ) : null}
    </div>
  );
}

function HistoricalAnalyticsSection({ model }: { model: UsageAnalyticsModel }) {
  const currentWeek = model.history.currentWeek;

  return (
    <section aria-label='Historical activity' className='space-y-4'>
      <div className='space-y-2'>
        <h2 className='text-lg font-semibold text-foreground'>
          Historical activity
        </h2>
        <p className='text-sm leading-6 text-muted-foreground'>
          Based on recorded task progress changes since activity tracking
          launched. Calendar days use {model.analyticsTimezone}.
        </p>
      </div>

      {!model.history.hasActivity ? (
        <NoHistoricalActivityState />
      ) : (
        <>
          <section
            aria-label='Historical activity summary'
            className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
          >
            <MetricCard
              icon={<Flame aria-hidden />}
              label='Current streak'
              value={formatDayCount(model.history.currentStreakDays)}
              sublabel={`Longest: ${formatDayCount(model.history.longestStreakDays)}`}
            />
            <MetricCard
              icon={<CalendarDays aria-hidden />}
              label='Active days this week'
              value={`${currentWeek.activeDays}/7`}
              sublabel={`${currentWeek.progressChangeCount} progress changes`}
            />
            <MetricCard
              icon={<ListChecks aria-hidden />}
              label='Completed events this week'
              value={currentWeek.completedEvents.toString()}
              sublabel='From recorded status changes'
            />
            <MetricCard
              icon={<TrendingUp aria-hidden />}
              label='Estimated completion added'
              value={formatMinutes(currentWeek.estimatedCompletionAddedMinutes)}
              sublabel='From completed event estimates'
            />
          </section>

          {currentWeek.progressChangeCount === 0 ? (
            <NoCurrentWeekActivityState />
          ) : null}

          <WeeklyTrendSection
            weeks={model.history.weeklyTrends}
            maxProgressChanges={model.history.maxWeeklyProgressChanges}
          />
        </>
      )}
    </section>
  );
}

function NoHistoricalActivityState() {
  return (
    <Surface variant='inset'>
      <div className='space-y-2'>
        <h3 className='text-base font-semibold text-foreground'>
          No recorded activity yet
        </h3>
        <p className='text-sm leading-6 text-muted-foreground'>
          Streaks and weekly summaries start after task progress changes are
          recorded. Earlier study activity is not backfilled.
        </p>
      </div>
    </Surface>
  );
}

function NoCurrentWeekActivityState() {
  return (
    <Surface variant='inset'>
      <div className='space-y-2'>
        <h3 className='text-base font-semibold text-foreground'>
          No activity recorded this week
        </h3>
        <p className='text-sm leading-6 text-muted-foreground'>
          Weekly summaries update when task progress changes are recorded.
        </p>
      </div>
    </Surface>
  );
}

function NoPlansState() {
  return (
    <RouteEmptyState
      icon={BarChart3}
      title='No usage data yet'
      description='Create a learning plan to start seeing current completion progress and estimated completed learning time.'
      action={
        <Button asChild>
          <Link href={ROUTES.PLANS.NEW}>
            <Plus aria-hidden />
            Create plan
          </Link>
        </Button>
      }
    />
  );
}

function NoCompletedWorkState() {
  return (
    <Surface variant='inset'>
      <div className='space-y-2'>
        <h2 className='text-base font-semibold text-foreground'>
          No completed work yet
        </h2>
        <p className='text-sm leading-6 text-muted-foreground'>
          Estimated completed learning time appears after tasks are marked
          complete.
        </p>
      </div>
    </Surface>
  );
}

function PlanCompletionSection({ plans }: { plans: UsageAnalyticsPlanRow[] }) {
  return (
    <Surface>
      <div className='mb-5 space-y-2'>
        <h2 className='text-lg font-semibold text-foreground'>
          Plan completion
        </h2>
        <p className='text-sm leading-6 text-muted-foreground'>
          Current task and module completion from your learning plans.
        </p>
      </div>

      <div className='divide-y divide-border'>
        {plans.map((plan) => (
          <PlanCompletionRow key={plan.id} plan={plan} />
        ))}
      </div>
    </Surface>
  );
}

function WeeklyTrendSection({
  weeks,
  maxProgressChanges,
}: {
  weeks: UsageAnalyticsWeekRow[];
  maxProgressChanges: number;
}) {
  return (
    <Surface>
      <div className='mb-5 space-y-2'>
        <h2 className='text-lg font-semibold text-foreground'>Weekly trend</h2>
        <p className='text-sm leading-6 text-muted-foreground'>
          Progress changes and completion events from recorded activity history.
        </p>
      </div>

      <div className='space-y-4'>
        {weeks.map((week) => (
          <WeeklyTrendRow
            key={week.weekStartDate}
            week={week}
            maxProgressChanges={maxProgressChanges}
          />
        ))}
      </div>
    </Surface>
  );
}

function WeeklyTrendRow({
  week,
  maxProgressChanges,
}: {
  week: UsageAnalyticsWeekRow;
  maxProgressChanges: number;
}) {
  const width = `${Math.round(
    (week.progressChangeCount / maxProgressChanges) * 100,
  )}%`;

  return (
    <div className='grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_12rem] sm:items-center'>
      <div>
        <p className='text-sm font-medium text-foreground'>{week.label}</p>
        {week.isCurrentWeek ? (
          <p className='text-xs text-muted-foreground'>Current week</p>
        ) : null}
      </div>
      <div className='h-2 overflow-hidden rounded-full bg-muted'>
        <div className='h-full rounded-full bg-primary' style={{ width }} />
      </div>
      <p className='text-sm text-muted-foreground tabular-nums sm:text-right'>
        {week.progressChangeCount} changes · {week.completedEvents} completed
      </p>
    </div>
  );
}

function PlanActivitySection({ plans }: { plans: UsageAnalyticsPlanRow[] }) {
  return (
    <Surface>
      <div className='mb-5 space-y-2'>
        <h2 className='text-lg font-semibold text-foreground'>Plan activity</h2>
        <p className='text-sm leading-6 text-muted-foreground'>
          Per-plan streaks and this week&apos;s recorded progress changes.
        </p>
      </div>

      <div className='divide-y divide-border'>
        {plans.map((plan) => (
          <PlanActivityRow key={plan.id} plan={plan} />
        ))}
      </div>
    </Surface>
  );
}

function PlanActivityRow({ plan }: { plan: UsageAnalyticsPlanRow }) {
  return (
    <article className='grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-center'>
      <div className='min-w-0'>
        <h3 className='text-base font-semibold text-foreground'>
          {plan.topic}
        </h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          {plan.activeDaysThisWeek === 0
            ? 'No progress changes recorded this week.'
            : `${formatDayCount(plan.activeDaysThisWeek)} active this week.`}
        </p>
      </div>

      <dl className='grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2'>
        <Metric label='Streak' value={formatDayCount(plan.currentStreakDays)} />
        <Metric
          label='Active days'
          value={plan.activeDaysThisWeek.toString()}
        />
        <Metric
          label='Completed'
          value={plan.completedEventsThisWeek.toString()}
        />
        <Metric
          label='Est. added'
          value={formatMinutes(plan.estimatedCompletionAddedThisWeek)}
        />
      </dl>
    </article>
  );
}

function PlanCompletionRow({ plan }: { plan: UsageAnalyticsPlanRow }) {
  return (
    <article className='grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-center'>
      <div className='min-w-0 space-y-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <h3 className='min-w-0 text-base font-semibold text-foreground'>
            {plan.topic}
          </h3>
          <span className='shrink-0 text-sm font-medium text-foreground tabular-nums'>
            {plan.taskCompletionPercent}% complete
          </span>
        </div>
        <ProgressBar value={plan.taskCompletionPercent} />
      </div>

      <dl className='grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2'>
        <Metric
          label='Tasks'
          value={`${plan.completedTasks}/${plan.totalTasks}`}
        />
        <Metric
          label='Modules'
          value={`${plan.completedModules}/${plan.totalModules}`}
        />
        <Metric
          label='Estimated complete'
          value={formatMinutes(plan.completedMinutes)}
        />
        <Metric
          label='Plan estimate'
          value={formatMinutes(plan.totalMinutes)}
        />
      </dl>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-xs font-medium text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='mt-1 font-medium text-foreground tabular-nums'>{value}</dd>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className='h-2 w-full overflow-hidden rounded-full bg-muted'
      aria-hidden='true'
    >
      <div
        className='h-full rounded-full bg-primary'
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function formatDayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
