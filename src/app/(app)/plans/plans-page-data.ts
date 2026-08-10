import type { UsageSummary } from '@/features/billing/usage-metrics';
import type { PlanListQuery } from '@/features/plans/read-projection/types';

import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { getPlansPageForRead } from '@/features/plans/read-projection/service';
import { requestBoundary } from '@/lib/api/request-boundary';

export type PlansPageData = {
  plansPage: Awaited<ReturnType<typeof getPlansPageForRead>>;
  usage: UsageSummary;
};

export function loadPlansPageData(
  query: PlanListQuery,
): Promise<PlansPageData | null> {
  return requestBoundary.component(async ({ actor, db }) => {
    const [plansPage, snapshot] = await Promise.all([
      getPlansPageForRead({ userId: actor.id, dbClient: db, query }),
      getBillingAccountSnapshot({ userId: actor.id, dbClient: db }),
    ]);

    return {
      plansPage,
      usage: snapshot.usage,
    };
  });
}
