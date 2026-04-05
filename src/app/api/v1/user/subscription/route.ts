import { getUsageSummary } from '@/features/billing/usage-metrics';
import { type PlainHandler, withAuthAndRateLimit } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';

export const GET: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }) => {
    const db = getDb();
    const usage = await getUsageSummary(user.id, db);

    return json({
      tier: user.subscriptionTier,
      status: user.subscriptionStatus,
      periodEnd: user.subscriptionPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
      usage: {
        activePlans: usage.activePlans,
        regenerations: usage.regenerations,
        exports: usage.exports,
      },
    });
  })
);
