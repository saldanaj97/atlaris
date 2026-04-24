import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getStripe } from '@/features/billing/client';
import { mapStripeSubscriptionStatus } from '@/features/billing/stripe-commerce/subscription-status';
import { users } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import { isAbortError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

/**
 * Subscription sync call-site dependencies. `stripe` is optional: when omitted, production
 * code uses `getStripe()`; integration tests and other call sites may inject a `Stripe` mock
 * (same seam as `TransitionDeps` / acceptance testing). A future design could require only
 * `StripeGateway` — not part of this documentation-only pass.
 */
type SyncSubscriptionToDbDeps = {
	dbClient: DbClient;
	stripe?: Stripe;
	signal?: AbortSignal;
	timeoutMs?: number;
};

export type StripeSubscriptionForSync = Pick<
	Stripe.Subscription,
	'id' | 'cancel_at_period_end' | 'customer' | 'status'
> & {
	current_period_end?: number;
	items: {
		data: Array<{
			price?: string | { id: string };
		}>;
	};
};

function createAbortError(message: string): Error {
	const error = new Error(message);
	error.name = 'AbortError';
	return error;
}

async function withAbortSignal<T>(
	run: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	if (!signal) {
		return run();
	}

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			reject(createAbortError('Stripe request aborted.'));
		};

		signal.addEventListener('abort', onAbort, { once: true });

		if (signal.aborted) {
			signal.removeEventListener('abort', onAbort);
			reject(createAbortError('Stripe request aborted before execution.'));
			return;
		}

		let promise: Promise<T>;
		try {
			promise = run();
		} catch (error) {
			signal.removeEventListener('abort', onAbort);
			reject(error);
			return;
		}

		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', onAbort);
				const normalizedError =
					error instanceof Error
						? error
						: new Error(`Unknown rejection reason: ${String(error)}`);
				reject(normalizedError);
			},
		);
	});
}

/**
 * Stripe subscription → users row sync. Internal to write-side reconciliation
 * (`reconciliation.ts`); not a public billing API.
 */
export async function syncSubscriptionToDb(
	subscription: StripeSubscriptionForSync,
	deps: SyncSubscriptionToDbDeps,
): Promise<void> {
	const stripe = deps.stripe ?? getStripe();
	const { dbClient } = deps;
	const customerId =
		typeof subscription.customer === 'string'
			? subscription.customer
			: subscription.customer.id;

	const [user] = await dbClient
		.select({
			id: users.id,
			subscriptionTier: users.subscriptionTier,
		})
		.from(users)
		.where(eq(users.stripeCustomerId, customerId))
		.limit(1);

	if (!user) {
		logger.error(
			{
				customerId,
				event: 'subscription_sync_missing_user',
			},
			'No user found for Stripe customer ID. Skipping sync.',
		);
		return;
	}

	const firstPrice = subscription.items.data[0]?.price;
	const priceId = typeof firstPrice === 'string' ? firstPrice : firstPrice?.id;

	const existingTier =
		user.subscriptionTier === 'starter' || user.subscriptionTier === 'pro'
			? user.subscriptionTier
			: 'free';

	let tier: 'free' | 'starter' | 'pro' = existingTier;

	if (priceId) {
		const requestTimeoutMs = deps.timeoutMs ?? 10_000;
		try {
			const price = await withAbortSignal(
				() =>
					stripe.prices.retrieve(
						priceId,
						{
							expand: ['product'],
						},
						{
							timeout: requestTimeoutMs,
						},
					),
				deps.signal,
			);

			const product = price.product as Stripe.Product;
			const tierMetadata = product.metadata?.tier;

			if (tierMetadata === 'starter' || tierMetadata === 'pro') {
				tier = tierMetadata;
			}
		} catch (error) {
			if (isAbortError(error)) {
				logger.warn(
					{
						priceId,
						event: 'subscription_sync_price_fetch_aborted',
						timeoutMs: requestTimeoutMs,
					},
					'Stripe price lookup aborted during subscription sync',
				);
			} else {
				logger.error(
					{
						priceId,
						event: 'subscription_sync_price_fetch_failed',
						error,
					},
					'Error retrieving Stripe price/product during subscription sync',
				);
			}

			throw new Error(
				`Unable to determine subscription tier for Stripe price ${priceId}`,
			);
		}
	}

	const status = mapStripeSubscriptionStatus(subscription.status);

	const periodEnd = subscription.current_period_end;

	await dbClient
		.update(users)
		.set({
			subscriptionTier: tier,
			stripeSubscriptionId: subscription.id,
			subscriptionStatus: status,
			subscriptionPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
			cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
			updatedAt: new Date(),
		})
		.where(eq(users.id, user.id));
}
