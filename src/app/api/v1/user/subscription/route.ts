import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';

function toJsonUsageLimit(limit: number): number | null {
  return Number.isFinite(limit) ? limit : null;
}

export const GET = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ actor, db }) => {
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
          activePlans: {
            current: snapshot.usage.activePlans.current,
            limit: toJsonUsageLimit(snapshot.usage.activePlans.limit),
          },
          regenerations: {
            used: snapshot.usage.regenerations.used,
            limit: toJsonUsageLimit(snapshot.usage.regenerations.limit),
          },
          lessonGenerations: {
            used: snapshot.usage.lessonGenerations.used,
            limit: toJsonUsageLimit(snapshot.usage.lessonGenerations.limit),
          },
        },
      });
    } catch (error) {
      logger.error(
        { error, userId: actor.id },
        'Failed to load billing snapshot',
      );
      throw error;
    }
  },
);
