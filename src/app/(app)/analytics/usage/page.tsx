import type { Metadata } from 'next';

import {
  buildUsageAnalyticsModel,
  type UsageAnalyticsModel,
  type UsageAnalyticsPlanRow,
} from './usage-analytics-model';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/metric-card';
import { PageHeader } from '@/components/ui/page-header';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { Surface } from '@/components/ui/surface';
import { ROUTES } from '@/features/navigation/routes';
import { formatMinutes } from '@/features/plans/formatters';
import { listUsageAnalyticsPlanSummaries } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import {
  BarChart3,
  BookOpenCheck,
  Clock,
  ListChecks,
  Plus,
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
const HISTORICAL_PLACEHOLDER =
  'Streaks and weekly summaries start after activity tracking launches.';

export default async function UsageAnalyticsPage() {
  const result = await requestBoundary.component(async ({ actor, db }) => {
    const summaries = await listUsageAnalyticsPlanSummaries({
      userId: actor.id,
      dbClient: db,
    });

    return buildUsageAnalyticsModel(summaries);
  });

  if (!result) {
    redirect(SIGN_IN_RETURN_PATH);
  }

  return <UsageAnalyticsView model={result} />;
}

function UsageAnalyticsView({ model }: { model: UsageAnalyticsModel }) {
  return (
    <>
      <PageHeader
        title='Usage'
        subtitle='Current completion progress and estimated completed learning time from your plans.'
      />

      {model.planCount === 0 ? (
        <div className='space-y-6'>
          <NoPlansState />
          <HistoricalPlaceholder />
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

      <PlanCompletionSection plans={model.plans} />

      <HistoricalPlaceholder />
    </div>
  );
}

function HistoricalPlaceholder() {
  return (
    <Surface variant='muted'>
      <div className='space-y-2'>
        <h2 className='text-lg font-semibold text-foreground'>
          Historical analytics
        </h2>
        <p className='text-sm leading-6 text-muted-foreground'>
          {HISTORICAL_PLACEHOLDER}
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
