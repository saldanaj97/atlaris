/**
 * Write-side billing reconciliation (issue #311)
 *
 * **Callers (only):**
 * - `DefaultStripeCommerceBoundary.acceptWebhook()` after signature/livemode preflight
 * - `replaySyntheticSubscriptionCreated` (re-exported as `replayLocalSubscriptionCreated` from `local-checkout-replay.ts`)
 *
 * **Owns:**
 * - Stripe webhook idempotency row insert, duplicate short-circuit, rollback delete on apply failure
 * - Event dispatch: subscription created/updated/deleted, invoice.payment_failed, invoice.payment_succeeded resync
 * - Delegation into subscription DB sync + customer-scoped user updates
 *
 * **Outside this module:**
 * - Raw body size, signature verification, livemode mismatch HTTP responses
 * - Redirect / query validation on local completion route
 * - Billing read-model snapshot, pricing catalog, portal eligibility rules
 *
 * **Local replay DB:** Uses caller-injected `db` (service role from local completion route). Live checkout
 * customer creation uses request-scoped DB via boundary — intentional split preserved at call sites.
 *
 * Public `StripeCommerceBoundary` unchanged; this module is internal to `stripe-commerce/`.
 */

import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { CommerceSubscriptionSnapshot } from '@/features/billing/stripe-commerce/dtos';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';
import {
	type StripeSubscriptionForSync,
	syncSubscriptionToDb,
} from '@/features/billing/stripe-commerce/subscription-db-sync';
import { createCustomer } from '@/features/billing/subscriptions';
import type { users } from '@/lib/db/schema';
import { stripeWebhookEvents } from '@/lib/db/schema';
import { db as serviceRoleDb } from '@/lib/db/service-role';
import type { createLogger } from '@/lib/logging/logger';

type Logger = ReturnType<typeof createLogger>;
type ServiceRoleDb = typeof serviceRoleDb;

const STRIPE_SYNC_TIMEOUT_MS = 10_000;

export type StripeReconciliationDeps = {
	stripe?: Stripe;
	gateway?: StripeGateway;
	logger: Logger;
	db?: ServiceRoleDb;
	users: typeof users;
};

export type TransitionDeps = {
	stripe?: Stripe;
	logger: Logger;
	db: ServiceRoleDb;
	users: typeof users;
};

type UpdateUsersByStripeCustomerIdSet = {
	subscriptionTier?: 'free';
	subscriptionStatus?: 'canceled' | 'past_due';
	stripeSubscriptionId?: null;
	subscriptionPeriodEnd?: Date | null;
	cancelAtPeriodEnd?: boolean;
	updatedAt: Date;
};

type StripeMappedUser = {
	userId: string;
	subscriptionTier: 'free' | 'starter' | 'pro';
	subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing' | null;
	stripeSubscriptionId: string | null;
};

type MinimalSubscription = StripeSubscriptionForSync & {
	object: 'subscription';
};

function throwIfAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) {
		return;
	}

	const error = new Error('Stripe reconciliation aborted.');
	error.name = 'AbortError';
	throw error;
}

async function updateUsersByStripeCustomerId(
	customerId: string,
	set: UpdateUsersByStripeCustomerIdSet,
	deps: Pick<TransitionDeps, 'db' | 'users'>,
) {
	return deps.db
		.update(deps.users)
		.set(set)
		.where(eq(deps.users.stripeCustomerId, customerId))
		.returning({ userId: deps.users.id });
}

async function getUsersByStripeCustomerId(
	customerId: string,
	deps: Pick<TransitionDeps, 'db' | 'users'>,
): Promise<StripeMappedUser[]> {
	return deps.db
		.select({
			userId: deps.users.id,
			subscriptionTier: deps.users.subscriptionTier,
			subscriptionStatus: deps.users.subscriptionStatus,
			stripeSubscriptionId: deps.users.stripeSubscriptionId,
		})
		.from(deps.users)
		.where(eq(deps.users.stripeCustomerId, customerId));
}

async function updateUsersByIds(
	userIds: string[],
	set: UpdateUsersByStripeCustomerIdSet,
	deps: Pick<TransitionDeps, 'db' | 'users'>,
) {
	if (userIds.length === 0) {
		return [];
	}

	return deps.db
		.update(deps.users)
		.set(set)
		.where(inArray(deps.users.id, userIds))
		.returning({ userId: deps.users.id });
}

export async function applySubscriptionSync(
	subscription: StripeSubscriptionForSync,
	deps: TransitionDeps,
	options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<void> {
	if (!deps.stripe) {
		throw new Error('Stripe client is required for subscription sync.');
	}

	await syncSubscriptionToDb(subscription, {
		dbClient: deps.db,
		stripe: deps.stripe,
		signal: options?.signal,
		timeoutMs: options?.timeoutMs,
	});
}

export async function applySubscriptionDeleted(
	subscription: StripeSubscriptionForSync,
	deps: TransitionDeps,
	options?: { signal?: AbortSignal },
): Promise<void> {
	throwIfAborted(options?.signal);

	const customerId =
		typeof subscription.customer === 'string'
			? subscription.customer
			: subscription.customer.id;

	const currentPeriodEndTimestamp = subscription.current_period_end;
	const currentPeriodEnd = currentPeriodEndTimestamp
		? new Date(currentPeriodEndTimestamp * 1000)
		: null;
	const shouldRetainEntitlements =
		subscription.cancel_at_period_end === true &&
		currentPeriodEnd !== null &&
		currentPeriodEnd.getTime() > Date.now();

	const updatedUsers = await updateUsersByStripeCustomerId(
		customerId,
		shouldRetainEntitlements
			? {
					subscriptionStatus: 'canceled',
					stripeSubscriptionId: null,
					subscriptionPeriodEnd: currentPeriodEnd,
					cancelAtPeriodEnd: true,
					updatedAt: new Date(),
				}
			: {
					subscriptionTier: 'free',
					subscriptionStatus: 'canceled',
					stripeSubscriptionId: null,
					subscriptionPeriodEnd: null,
					cancelAtPeriodEnd: false,
					updatedAt: new Date(),
				},
		deps,
	);

	throwIfAborted(options?.signal);

	if (updatedUsers.length === 0) {
		deps.logger.warn(
			{
				customerId,
				stripeSubscriptionId: subscription.id,
			},
			'No user mapping found for customer.subscription.deleted',
		);
		return;
	}

	deps.logger.info(
		{
			customerId,
			userIds: updatedUsers.map(({ userId }) => userId),
			retainedEntitlementsUntil: shouldRetainEntitlements
				? (currentPeriodEnd?.toISOString() ?? null)
				: null,
		},
		'Stripe subscription deletion webhook processed',
	);
}

export async function applyPaymentFailed(
	invoice: Stripe.Invoice,
	deps: TransitionDeps,
	options?: { signal?: AbortSignal },
): Promise<void> {
	throwIfAborted(options?.signal);

	const customerId =
		typeof invoice.customer === 'string'
			? invoice.customer
			: invoice.customer?.id;

	if (!customerId) {
		deps.logger.warn(
			{
				invoiceId: invoice.id,
				invoiceCustomer: invoice.customer ?? null,
			},
			'No stripeCustomerId available for invoice.payment_failed',
		);
		return;
	}

	const mappedUsers = await getUsersByStripeCustomerId(customerId, deps);

	throwIfAborted(options?.signal);

	if (mappedUsers.length === 0) {
		deps.logger.warn(
			{
				customerId,
				invoiceId: invoice.id,
			},
			'No user mapping found for invoice.payment_failed',
		);
		return;
	}

	const eligibleUsers = mappedUsers.filter(
		(user) =>
			user.stripeSubscriptionId !== null &&
			(user.subscriptionStatus === 'trialing' ||
				user.subscriptionStatus === 'active' ||
				user.subscriptionStatus === 'past_due'),
	);
	const skippedUsers = mappedUsers.filter(
		(user) =>
			!eligibleUsers.some((eligible) => eligible.userId === user.userId),
	);

	if (skippedUsers.length > 0) {
		deps.logger.info(
			{
				customerId,
				invoiceId: invoice.id,
				skippedUsers: skippedUsers.map((user) => ({
					userId: user.userId,
					subscriptionTier: user.subscriptionTier,
					subscriptionStatus: user.subscriptionStatus,
				})),
			},
			'Skipped invoice.payment_failed transition for ineligible users',
		);
	}

	const updatedUsers = await updateUsersByIds(
		eligibleUsers.map((user) => user.userId),
		{
			subscriptionStatus: 'past_due',
			updatedAt: new Date(),
		},
		deps,
	);

	throwIfAborted(options?.signal);

	if (updatedUsers.length === 0) {
		deps.logger.info(
			{
				customerId,
				invoiceId: invoice.id,
			},
			'No eligible users required invoice.payment_failed transition',
		);
		return;
	}

	deps.logger.info(
		{ customerId },
		'Stripe invoice.payment_failed webhook processed',
	);
}

function snapshotToStripeSubscription(
	snapshot: CommerceSubscriptionSnapshot,
): MinimalSubscription {
	return {
		id: snapshot.subscriptionId,
		object: 'subscription',
		customer: snapshot.customerId,
		status: snapshot.status,
		cancel_at_period_end: snapshot.cancelAtPeriodEnd,
		items: {
			data: snapshot.primaryPriceId
				? [
						{
							price: { id: snapshot.primaryPriceId },
						},
					]
				: [],
		},
		current_period_end: snapshot.currentPeriodEnd
			? Math.floor(snapshot.currentPeriodEnd.getTime() / 1000)
			: undefined,
	};
}

function withTimeout<T>(
	timeoutMs: number,
	callback: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => {
		abortController.abort();
	}, timeoutMs);

	return callback(abortController.signal).finally(() => {
		clearTimeout(timeout);
	});
}

function getStripeErrorMeta(error: unknown): {
	errorCode: string | null;
	errorMessage: string;
	errorType: string | null;
	requestId: string | null;
} {
	if (!(error instanceof Error)) {
		return {
			errorCode: null,
			errorMessage: String(error),
			errorType: null,
			requestId: null,
		};
	}

	const stripeError = error as Error & {
		code?: string;
		lastResponse?: { requestId?: string };
		raw?: { requestId?: string };
		requestId?: string;
		type?: string;
	};

	return {
		errorCode: stripeError.code ?? null,
		errorMessage: stripeError.message,
		errorType: stripeError.type ?? null,
		requestId:
			stripeError.requestId ??
			stripeError.raw?.requestId ??
			stripeError.lastResponse?.requestId ??
			null,
	};
}

async function dispatchVerifiedStripeEvent(
	event: Stripe.Event,
	deps: StripeReconciliationDeps,
): Promise<void> {
	const stripeInstance = deps.stripe ?? deps.gateway?.getStripeClient();
	const { gateway, logger } = deps;
	const transitionDeps: TransitionDeps = {
		stripe: stripeInstance,
		logger: deps.logger,
		db: deps.db ?? serviceRoleDb,
		users: deps.users,
	};

	switch (event.type) {
		case 'checkout.session.completed': {
			logger.info('Stripe checkout.session.completed webhook processed');
			break;
		}

		case 'customer.subscription.created':
		case 'customer.subscription.updated': {
			const subscription = event.data.object as Stripe.Subscription;
			await withTimeout(STRIPE_SYNC_TIMEOUT_MS, async (signal) =>
				applySubscriptionSync(subscription, transitionDeps, {
					signal,
					timeoutMs: STRIPE_SYNC_TIMEOUT_MS,
				}),
			);
			logger.info(
				{
					type: event.type,
				},
				'Stripe subscription sync webhook processed',
			);
			break;
		}

		case 'customer.subscription.deleted': {
			const subscription = event.data.object as Stripe.Subscription;
			await withTimeout(STRIPE_SYNC_TIMEOUT_MS, async (signal) =>
				applySubscriptionDeleted(subscription, transitionDeps, { signal }),
			);
			break;
		}

		case 'invoice.payment_failed': {
			const invoice = event.data.object as Stripe.Invoice;
			await withTimeout(STRIPE_SYNC_TIMEOUT_MS, async (signal) =>
				applyPaymentFailed(invoice, transitionDeps, { signal }),
			);
			break;
		}

		case 'invoice.payment_succeeded': {
			const invoice = event.data.object as Stripe.Invoice;
			const subscriptionId =
				typeof invoice.subscription === 'string'
					? invoice.subscription
					: invoice.subscription?.id;

			if (!subscriptionId || !gateway) {
				const message = !subscriptionId
					? 'invoice.payment_succeeded missing subscription id for resync'
					: 'invoice.payment_succeeded cannot resync without Stripe gateway';

				logger.error(
					{
						eventId: event.id,
						subscriptionId: subscriptionId ?? null,
						hasStripeGateway: Boolean(gateway),
					},
					message,
				);
				throw new Error(`${message} (eventId=${event.id})`);
			}

			let subscription: MinimalSubscription;
			try {
				const snapshot = await gateway.retrieveSubscription({
					subscriptionId,
					timeoutMs: STRIPE_SYNC_TIMEOUT_MS,
				});
				subscription = snapshotToStripeSubscription(snapshot);
			} catch (error) {
				logger.error(
					{
						eventId: event.id,
						subscriptionId,
						operation: 'gateway.retrieveSubscription',
						...getStripeErrorMeta(error),
					},
					'Failed to retrieve Stripe subscription during invoice.payment_succeeded resync',
				);
				throw error;
			}

			try {
				await withTimeout(STRIPE_SYNC_TIMEOUT_MS, async (signal) =>
					applySubscriptionSync(subscription, transitionDeps, {
						signal,
						timeoutMs: STRIPE_SYNC_TIMEOUT_MS,
					}),
				);
			} catch (error) {
				logger.error(
					{
						eventId: event.id,
						subscriptionId,
						operation: 'syncSubscriptionToDb',
						...getStripeErrorMeta(error),
					},
					'Failed to sync subscription during invoice.payment_succeeded resync',
				);
				throw error;
			}

			logger.info(
				{
					eventId: event.id,
					subscriptionId,
				},
				'Stripe invoice.payment_succeeded webhook processed',
			);
			break;
		}

		default:
			logger.debug({ type: event.type }, 'Unhandled Stripe webhook event');
			break;
	}
}

/**
 * Idempotent insert + dispatch + rollback on failure (production + local replay).
 */
export async function applyVerifiedEvent(
	event: Stripe.Event,
	deps: StripeReconciliationDeps,
): Promise<'inserted' | 'duplicate'> {
	const db = deps.db ?? serviceRoleDb;

	const [insertedRow] = await db
		.insert(stripeWebhookEvents)
		.values({
			eventId: event.id,
			livemode: event.livemode,
			type: event.type,
		})
		.onConflictDoNothing({ target: stripeWebhookEvents.eventId })
		.returning({ eventId: stripeWebhookEvents.eventId });

	if (!insertedRow) {
		deps.logger.info(
			{ type: event.type, eventId: event.id },
			'Duplicate Stripe webhook event skipped',
		);
		return 'duplicate';
	}

	try {
		await dispatchVerifiedStripeEvent(event, deps);
	} catch (error) {
		try {
			await db
				.delete(stripeWebhookEvents)
				.where(eq(stripeWebhookEvents.eventId, event.id));
		} catch (cleanupError) {
			deps.logger.error(
				{
					eventType: event.type,
					eventId: event.id,
					cleanupError,
				},
				'Failed to rollback Stripe webhook event record after processing error',
			);
		}

		deps.logger.error(
			{
				eventType: event.type,
				eventId: event.id,
				error,
			},
			'Stripe webhook processing failed; event record rolled back',
		);
		throw error;
	}

	return 'inserted';
}

/**
 * Synthetic `customer.subscription.created` for local billing — same `applyVerifiedEvent`
 * path as production webhooks (dedupe + dispatch).
 *
 * **DB:** Uses `serviceRoleDb` from input (matches prior `createCustomer(..., serviceRoleDb)`).
 */
export async function replaySyntheticSubscriptionCreated(input: {
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
					price: { id: input.priceId },
				},
			],
		},
		current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
	} satisfies MinimalSubscription;

	const event = {
		id: `evt_local_${randomUUID()}`,
		object: 'event',
		type: 'customer.subscription.created',
		data: { object: subscription },
		livemode: false,
	} as unknown as Stripe.Event;

	await applyVerifiedEvent(event, {
		stripe,
		gateway: input.gateway,
		logger: input.logger,
		users: input.users,
		db: input.serviceRoleDb,
	});
}
