import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import type { UsageSummary } from '@/features/billing/usage-metrics';
import { listPlansPageSummaries } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';

export type PlansPageData = {
  summaries: Awaited<ReturnType<typeof listPlansPageSummaries>>;
  usage: UsageSummary;
};

export function loadPlansPageData(): Promise<PlansPageData | null> {
  return requestBoundary.component(async ({ actor, db }) => {
    const [summaries, snapshot] = await Promise.all([
      listPlansPageSummaries({ userId: actor.id, dbClient: db }),
      getBillingAccountSnapshot({ userId: actor.id, dbClient: db }),
    ]);

    return {
      summaries,
      usage: snapshot.usage,
    };
  });
}
