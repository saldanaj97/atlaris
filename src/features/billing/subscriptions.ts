import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import { logger } from '@/lib/logging/logger';
import { getStripe } from './client';

const CUSTOMER_PROVISION_LOCK_KEY = 2;
const CUSTOMER_PROVISION_REQUEST_TIMEOUT_MS = 10_000;
const CUSTOMER_PROVISION_WARN_THRESHOLD_MS = 500;

/**
 * Create a Stripe customer for a user
 * @param stripeInstance Optional Stripe client (for tests); uses getStripe() when omitted
 * @returns Stripe customer ID
 */
export async function createCustomer(
	userId: string,
	email: string,
	stripeInstance?: Stripe,
	dbClient: DbClient = getDb(),
): Promise<string> {
	const stripe = stripeInstance ?? getStripe();
	return dbClient.transaction(async (tx) => {
		// Serialize customer provisioning per user to avoid duplicate Stripe
		// customers when checkout is triggered concurrently.
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(${CUSTOMER_PROVISION_LOCK_KEY}, hashtext(${userId}))`,
		);

		const [existingUser] = await tx
			.select({ stripeCustomerId: users.stripeCustomerId })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (existingUser?.stripeCustomerId) {
			return existingUser.stripeCustomerId;
		}

		const stripeCallStartedAt = Date.now();
		const customer = await stripe.customers.create(
			{
				email,
				metadata: {
					userId,
				},
			},
			{
				timeout: CUSTOMER_PROVISION_REQUEST_TIMEOUT_MS,
			},
		);
		const stripeCallDurationMs = Date.now() - stripeCallStartedAt;

		if (stripeCallDurationMs > CUSTOMER_PROVISION_WARN_THRESHOLD_MS) {
			logger.warn(
				{
					userId,
					stripeCallDurationMs,
					timeoutMs: CUSTOMER_PROVISION_REQUEST_TIMEOUT_MS,
				},
				'Stripe customer creation inside advisory lock exceeded warning threshold',
			);
		}

		await tx
			.update(users)
			.set({
				stripeCustomerId: customer.id,
				updatedAt: new Date(),
			})
			.where(eq(users.id, userId));

		return customer.id;
	});
}
