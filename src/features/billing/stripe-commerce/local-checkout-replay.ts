import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';
import { handleStripeWebhookDedupeAndApply } from '@/features/billing/stripe-webhook-processor';
import { createCustomer } from '@/features/billing/subscriptions';
import type { users } from '@/lib/db/schema';
import type { db as serviceRoleDb } from '@/lib/db/service-role';
import type { Logger } from '@/lib/logging/logger';

type ServiceRoleDb = typeof serviceRoleDb;

/**
 * Applies a synthetic `customer.subscription.created` event through the same
 * dedupe + processor path as production webhooks (local billing only).
 */
export async function replayLocalSubscriptionCreated(input: {
	user: { id: string; email: string };
	priceId: string;
	gateway: StripeGateway;
	serviceRoleDb: ServiceRoleDb;
	users: typeof users;
	logger: Logger;
}): Promise<void> {
	const stripe = input.gateway.getStripeClient();
	const customerId = await createCustomer(
		input.user.id,
		input.user.email,
		stripe,
		input.serviceRoleDb,
	);

	const subscription = {
		id: `sub_local_${randomUUID()}`,
		object: 'subscription',
		customer: customerId,
		status: 'active',
		cancel_at_period_end: false,
		items: {
			data: [
				{
					price: input.priceId,
				},
			],
		},
		current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
	} as unknown as Stripe.Subscription;

	const event = {
		id: `evt_local_${randomUUID()}`,
		object: 'event',
		type: 'customer.subscription.created',
		data: { object: subscription },
		livemode: false,
	} as Stripe.Event;

	await handleStripeWebhookDedupeAndApply(event, {
		stripe,
		gateway: input.gateway,
		logger: input.logger,
		users: input.users,
		db: input.serviceRoleDb,
	});
}
