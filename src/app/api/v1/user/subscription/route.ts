import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';

export const GET = withErrorBoundary(
  requestBoundary.route({ rateLimit: 'read' }, async ({ actor, db }) => {
    try {
      const snapshot = await getBillingAccountSnapshot({
        userId: actor.id,
        dbClient: db,
      });

      logger.info(
        { userId: actor.id, tier: snapshot.tier },
        'Billing account snapshot retrieved',
      );

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
    } catch (error) {
      logger.error(
        { error, userId: actor.id },
        'Failed to load billing snapshot',
      );
      throw error;
    }
  }),
);
