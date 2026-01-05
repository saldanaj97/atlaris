import { getOrCreateCurrentUserRecord } from '@/lib/api/auth';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getUsageSummary } from '@/lib/stripe/usage';
import { redirect } from 'next/navigation';

import { ActivityStream } from './components/ActivityStream';

export default async function DashboardPage() {
  const user = await getOrCreateCurrentUserRecord();
  if (!user) {
    redirect('/sign-in?redirect_url=/dashboard');
  }

  const summaries = await getPlanSummariesForUser(user.id);
  const usage = await getUsageSummary(user.id);

  const completedPlans = summaries.filter(
    ({ completion }) => completion >= 1 - 1e-6
  );
  const activePlans = summaries.length - completedPlans.length;
  const totalHoursLearned = Math.round(
    summaries.reduce((sum, summary) => sum + summary.completedMinutes, 0) / 60
  );

  const reachedPlanLimit =
    usage.activePlans.limit !== Infinity &&
    usage.activePlans.current >= usage.activePlans.limit;
  const reachedRegenLimit =
    usage.regenerations.limit !== Infinity &&
    usage.regenerations.used >= usage.regenerations.limit;
  const reachedExportLimit =
    usage.exports.limit !== Infinity &&
    usage.exports.used >= usage.exports.limit;
  const limitsReached =
    reachedPlanLimit || reachedRegenLimit || reachedExportLimit;

  return (
    <ActivityStream
      summaries={summaries}
      totalHoursLearned={totalHoursLearned}
      activePlans={activePlans}
      completedPlans={completedPlans.length}
      usage={{
        tier: usage.tier,
        activePlans: usage.activePlans,
        regenerations: usage.regenerations,
        exports: usage.exports,
      }}
      limitsReached={limitsReached}
    />
  );
}
