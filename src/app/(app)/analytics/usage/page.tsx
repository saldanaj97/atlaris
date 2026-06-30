import type { Metadata } from 'next';

import { UsageAnalyticsContent } from './usage-analytics-content';
import {
  buildUsageAnalyticsModel,
  type UsageAnalyticsModel,
} from './usage-analytics-model';
import { UsageAnalyticsTimezoneSync } from './usage-analytics-timezone-sync';
import { ROUTES } from '@/features/navigation/routes';
import { listUsageAnalyticsPlanSummaries } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { getLearningActivityEventsForUser } from '@/lib/db/queries/tasks';
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

/** Server page that loads usage analytics and redirects unauthenticated users. */
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

/** Renders timezone sync and the usage analytics dashboard from the loaded model. */
function UsageAnalyticsView({ model }: { model: UsageAnalyticsModel }) {
  return (
    <>
      <UsageAnalyticsTimezoneSync analyticsTimezone={model.analyticsTimezone} />
      <UsageAnalyticsContent model={model} />
    </>
  );
}
