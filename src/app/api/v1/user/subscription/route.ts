import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { type PlainHandler, withAuthAndRateLimit } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';

export const GET: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }) => {
    const snapshot = await getBillingAccountSnapshot(user.id, getDb());

    return json({
      tier: snapshot.tier,
      status: snapshot.subscriptionStatus,
      periodEnd: snapshot.subscriptionPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      usage: {
        activePlans: snapshot.usage.activePlans,
        regenerations: snapshot.usage.regenerations,
        exports: snapshot.usage.exports,
      },
    });
  })
);
