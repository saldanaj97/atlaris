/**
 * Unit tests for write-side billing reconciliation (`applyVerifiedEvent`).
 *
 * Focus: idempotency insert + rollback uses deps.db (injected), not module-global.
 */

import { makeDbClient } from '@tests/fixtures/db-mocks';
import { createId } from '@tests/fixtures/ids';
import {
	makeStripeInvoice,
	makeStripeMock,
	makeStripeSubscription,
} from '@tests/fixtures/stripe-mocks';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';
import {
	applyVerifiedEvent,
	type StripeReconciliationDeps,
} from '@/features/billing/stripe-commerce/reconciliation';
import { users } from '@/lib/db/schema';
import { createLogger } from '@/lib/logging/logger';

function makeEvent(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
	return {
		id: createId('evt'),
		object: 'event',
		type: 'checkout.session.completed',
		livemode: false,
		data: { object: {} as Stripe.Event.Data['object'] },
		...overrides,
	} as Stripe.Event;
}

function buildMockDb(
	opts: {
		insertReturns?: unknown[];
		updateReturns?: unknown[];
		updateThrows?: Error;
		deleteThrows?: Error;
		selectReturns?: unknown[];
	} = {},
) {
	const insertReturns = opts.insertReturns ?? [{ eventId: createId('evt') }];
	const updateReturns = opts.updateReturns ?? [{ userId: createId('user') }];

	const whereDeleteMock = vi.fn().mockResolvedValue(undefined);
	if (opts.deleteThrows) {
		const err = opts.deleteThrows;
		whereDeleteMock.mockRejectedValue(err);
	}

	const deleteMock = vi.fn().mockReturnValue({ where: whereDeleteMock });

	const returningUpdateMock = vi.fn().mockResolvedValue(updateReturns);
	if (opts.updateThrows) {
		const err = opts.updateThrows;
		returningUpdateMock.mockRejectedValue(err);
	}

	const updateMock = vi.fn().mockReturnValue({
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnValue({ returning: returningUpdateMock }),
	});

	const selectReturns = opts.selectReturns ?? [
		{
			id: createId('user'),
			subscriptionTier: 'free',
		},
	];
	const selectMock = vi.fn().mockReturnValue({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue(selectReturns),
			}),
		}),
	});

	const insertMock = vi.fn().mockReturnValue({
		values: vi.fn().mockReturnThis(),
		onConflictDoNothing: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue(insertReturns),
	});

	return Object.assign(makeDbClient(), {
		insert: insertMock,
		select: selectMock,
		update: updateMock,
		delete: deleteMock,
	});
}

function makeLogger() {
	return Object.assign(createLogger({ test: 'stripe-reconciliation.spec' }), {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	});
}

function makeDeps(
	overrides: Partial<StripeReconciliationDeps> = {},
): StripeReconciliationDeps {
	return {
		db: buildMockDb(),
		logger: makeLogger(),
		users,
		...overrides,
	};
}

describe('applyVerifiedEvent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('deduplication', () => {
		it('returns "duplicate" when insert returns no rows (conflict)', async () => {
			const db = buildMockDb({ insertReturns: [] });
			const logger = makeLogger();
			const deps = makeDeps({
				db,
				logger,
			});

			const result = await applyVerifiedEvent(makeEvent(), deps);

			expect(result).toBe('duplicate');
		});

		it('logs the event id and type on duplicate', async () => {
			const db = buildMockDb({ insertReturns: [] });
			const logger = makeLogger();
			const deps = makeDeps({
				db,
				logger,
			});
			const event = makeEvent({
				id: 'evt_dup_xyz',
				type: 'invoice.payment_failed',
			});

			await applyVerifiedEvent(event, deps);

			expect(logger.info).toHaveBeenCalledWith(
				{ type: 'invoice.payment_failed', eventId: 'evt_dup_xyz' },
				'Duplicate Stripe webhook event skipped',
			);
		});

		it('does NOT call delete when a duplicate is detected', async () => {
			const db = buildMockDb({ insertReturns: [] });
			const deps = makeDeps({
				db,
				logger: makeLogger(),
			});

			await applyVerifiedEvent(makeEvent(), deps);

			expect(db.delete).not.toHaveBeenCalled();
		});
	});

	describe('successful insertion', () => {
		it('returns "inserted" when no duplicate', async () => {
			const db = buildMockDb();
			const deps = makeDeps({
				db,
				logger: makeLogger(),
			});

			const result = await applyVerifiedEvent(makeEvent(), deps);

			expect(result).toBe('inserted');
		});

		it('calls deps.db.insert with correct event fields', async () => {
			const db = buildMockDb();
			const deps = makeDeps({
				db,
				logger: makeLogger(),
			});
			const event = makeEvent({
				id: 'evt_abc',
				type: 'invoice.payment_failed',
				livemode: true,
			});

			await applyVerifiedEvent(event, deps);

			expect(db.insert).toHaveBeenCalledTimes(1);
			const chain = db.insert.mock.results[0]?.value as ReturnType<
				typeof db.insert
			>;
			expect(chain.values).toHaveBeenCalledWith({
				eventId: 'evt_abc',
				livemode: true,
				type: 'invoice.payment_failed',
			});
		});

		it('logs and throws when invoice.payment_succeeded has no subscription id', async () => {
			const eventId = createId('evt');
			const customerId = createId('cus');
			const db = buildMockDb({
				insertReturns: [{ eventId }],
			});
			const gateway: StripeGateway = {
				getStripeClient: () => makeStripeMock({}),
				createCheckoutSession: vi.fn(async () => ({ url: null })),
				createBillingPortalSession: vi.fn(async () => ({ url: null })),
				constructWebhookEvent: vi.fn(() => {
					throw new Error('not used');
				}),
				retrieveSubscription: vi.fn(),
			};
			const logger = makeLogger();
			const deps = makeDeps({
				db,
				gateway,
				logger,
			});
			const event = makeEvent({
				id: eventId,
				type: 'invoice.payment_succeeded',
				data: {
					object: makeStripeInvoice({
						customer: customerId,
						subscription: null,
					}),
				},
			});

			await expect(applyVerifiedEvent(event, deps)).rejects.toThrow(
				/missing subscription id/,
			);

			expect(logger.error).toHaveBeenCalledWith(
				{
					eventId,
					subscriptionId: null,
					hasStripeGateway: true,
				},
				'invoice.payment_succeeded missing subscription id for resync',
			);
			expect(db.delete).toHaveBeenCalledTimes(1);
			expect(gateway.retrieveSubscription).not.toHaveBeenCalled();
		});

		it('logs and throws when invoice.payment_succeeded has no gateway', async () => {
			const eventId = createId('evt');
			const subscriptionId = createId('sub');
			const customerId = createId('cus');
			const db = buildMockDb({
				insertReturns: [{ eventId }],
			});
			const logger = makeLogger();
			const deps = makeDeps({
				db,
				gateway: undefined,
				logger,
				stripe: makeStripeMock({}),
			});
			const event = makeEvent({
				id: eventId,
				type: 'invoice.payment_succeeded',
				data: {
					object: makeStripeInvoice({
						customer: customerId,
						subscription: subscriptionId,
					}),
				},
			});

			await expect(applyVerifiedEvent(event, deps)).rejects.toThrow(
				/cannot resync without Stripe gateway/,
			);

			expect(logger.error).toHaveBeenCalledWith(
				{
					eventId,
					subscriptionId,
					hasStripeGateway: false,
				},
				'invoice.payment_succeeded cannot resync without Stripe gateway',
			);
			expect(db.delete).toHaveBeenCalledTimes(1);
		});

		it('logs Stripe errors from gateway.retrieveSubscription during payment_succeeded resync', async () => {
			const eventId = createId('evt');
			const subscriptionId = createId('sub');
			const customerId = createId('cus');
			const retrieveErr = new Error('stripe retrieve failed');
			const db = buildMockDb({
				insertReturns: [{ eventId }],
			});
			const gateway: StripeGateway = {
				getStripeClient: () =>
					makeStripeMock({
						prices: {
							retrieve: vi.fn(),
						},
					}),
				createCheckoutSession: vi.fn(async () => ({ url: null })),
				createBillingPortalSession: vi.fn(async () => ({ url: null })),
				constructWebhookEvent: vi.fn(() => {
					throw new Error('not used');
				}),
				retrieveSubscription: vi.fn().mockRejectedValue(retrieveErr),
			};
			const deps = makeDeps({
				db,
				gateway,
				logger: makeLogger(),
			});
			const event = makeEvent({
				id: eventId,
				type: 'invoice.payment_succeeded',
				data: {
					object: makeStripeInvoice({
						customer: customerId,
						subscription: subscriptionId,
					}),
				},
			});

			await expect(applyVerifiedEvent(event, deps)).rejects.toThrow(
				'stripe retrieve failed',
			);

			expect(deps.logger.error).toHaveBeenCalledWith(
				expect.objectContaining({
					eventId,
					subscriptionId,
					operation: 'gateway.retrieveSubscription',
					errorMessage: 'stripe retrieve failed',
				}),
				'Failed to retrieve Stripe subscription during invoice.payment_succeeded resync',
			);
			expect(db.delete).toHaveBeenCalledTimes(1);
		});

		it('uses gateway.retrieveSubscription for invoice.payment_succeeded resync', async () => {
			const eventId = createId('evt');
			const subscriptionId = createId('sub');
			const customerId = createId('cus');
			const priceId = createId('price');
			const db = buildMockDb({
				insertReturns: [{ eventId }],
				selectReturns: [
					{
						id: createId('user'),
						subscriptionTier: 'free',
					},
				],
			});
			const pricesRetrieve = vi.fn().mockResolvedValue({
				product: { metadata: { tier: 'starter' } },
			});
			const gateway: StripeGateway = {
				getStripeClient: () =>
					makeStripeMock({
						prices: {
							retrieve: pricesRetrieve,
						},
					}),
				createCheckoutSession: vi.fn(async () => ({ url: null })),
				createBillingPortalSession: vi.fn(async () => ({ url: null })),
				constructWebhookEvent: vi.fn(() => {
					throw new Error('not used');
				}),
				retrieveSubscription: vi.fn().mockResolvedValue({
					subscriptionId,
					customerId,
					status: 'active',
					currentPeriodEnd: new Date('2025-01-01T00:00:00.000Z'),
					cancelAtPeriodEnd: false,
					primaryPriceId: priceId,
				}),
			};
			const deps = makeDeps({
				db,
				gateway,
				logger: makeLogger(),
			});
			const event = makeEvent({
				id: eventId,
				type: 'invoice.payment_succeeded',
				data: {
					object: makeStripeInvoice({
						customer: customerId,
						subscription: subscriptionId,
					}),
				},
			});

			await expect(applyVerifiedEvent(event, deps)).resolves.toBe('inserted');

			expect(gateway.retrieveSubscription).toHaveBeenCalledWith({
				subscriptionId,
				timeoutMs: 10_000,
			});
			expect(pricesRetrieve).toHaveBeenCalledWith(
				priceId,
				{ expand: ['product'] },
				{ timeout: 10_000 },
			);
		});
	});

	describe('rollback on apply failure', () => {
		it('calls deps.db.delete when dispatch throws', async () => {
			const applyError = new Error('db update failed');
			const db = buildMockDb({
				insertReturns: [{ eventId: 'evt_rollback' }],
				updateThrows: applyError,
			});
			const logger = makeLogger();
			const deps = makeDeps({
				db,
				logger,
			});

			const event = makeEvent({
				id: 'evt_rollback',
				type: 'customer.subscription.deleted',
				data: {
					object: makeStripeSubscription({
						id: createId('sub'),
						customer: createId('cus'),
					}),
				},
			});

			await expect(applyVerifiedEvent(event, deps)).rejects.toThrow(
				'db update failed',
			);

			expect(db.delete).toHaveBeenCalledTimes(1);
		});

		it('logs the rollback error and re-throws the original apply error', async () => {
			const applyError = new Error('apply failed');
			const db = buildMockDb({
				insertReturns: [{ eventId: 'evt_rollback2' }],
				updateThrows: applyError,
			});
			const logger = makeLogger();
			const deps = makeDeps({
				db,
				logger,
			});

			const event = makeEvent({
				id: 'evt_rollback2',
				type: 'customer.subscription.deleted',
				data: {
					object: makeStripeSubscription({
						id: createId('sub'),
						customer: createId('cus'),
					}),
				},
			});

			await expect(applyVerifiedEvent(event, deps)).rejects.toThrow(
				'apply failed',
			);

			expect(logger.error).toHaveBeenCalledWith(
				expect.objectContaining({
					eventId: 'evt_rollback2',
					error: applyError,
				}),
				'Stripe webhook processing failed; event record rolled back',
			);
		});

		it('logs cleanup failure when delete also throws', async () => {
			const applyError = new Error('apply failed');
			const cleanupError = new Error('delete failed');
			const db = buildMockDb({
				insertReturns: [{ eventId: 'evt_double_fail' }],
				updateThrows: applyError,
				deleteThrows: cleanupError,
			});
			const logger = makeLogger();
			const deps = makeDeps({
				db,
				logger,
			});

			const event = makeEvent({
				id: 'evt_double_fail',
				type: 'customer.subscription.deleted',
				data: {
					object: makeStripeSubscription({
						id: createId('sub'),
						customer: createId('cus'),
					}),
				},
			});

			await expect(applyVerifiedEvent(event, deps)).rejects.toThrow(
				'apply failed',
			);

			expect(logger.error).toHaveBeenCalledWith(
				expect.objectContaining({ cleanupError }),
				'Failed to rollback Stripe webhook event record after processing error',
			);
		});
	});
});
