import { getBillingAccountSnapshot } from '@/features/billing/account-snapshot';
import { type PlainHandler, withAuthAndRateLimit } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';

export const GET: PlainHandler = withErrorBoundary(
	withAuthAndRateLimit('read', async ({ user }) => {
		try {
			const snapshot = await getBillingAccountSnapshot({
				userId: user.id,
				dbClient: getDb(),
			});

			logger.info(
				{ userId: user.id, tier: snapshot.tier },
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
				{ error, userId: user.id },
				'Failed to load billing snapshot',
			);
			throw error;
		}
	}),
);
