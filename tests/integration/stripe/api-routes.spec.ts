import {
	makeStripeInvoice,
	makeStripeMock,
	makeStripeSubscription,
} from '@tests/fixtures/stripe-mocks';
import { sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCreatePortalHandler } from '@/app/api/v1/stripe/create-portal/route';
import { GET as localCompleteCheckoutGET } from '@/app/api/v1/stripe/local/complete-checkout/route';
import { createWebhookHandler } from '@/app/api/v1/stripe/webhook/route';
import { GET as subscriptionGET } from '@/app/api/v1/user/subscription/route';
import { LOCAL_PRICE_IDS } from '@/features/billing/local-catalog';
import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import {
	buildStripeCustomerId,
	buildStripeSubscriptionId,
	markUserAsSubscribed,
} from '../../helpers/subscription';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

async function createAuthTestUser() {
	const authUserId = buildTestAuthUserId('stripe-api');
	const email = buildTestEmail(authUserId);
	const userId = await ensureUser({ authUserId, email });
	setTestUser(authUserId);
	return userId;
}

function makeStripeEvent({
	dataObject,
	...overrides
}: Omit<Partial<Stripe.Event>, 'data'> & {
	dataObject?: unknown;
} = {}): Stripe.Event {
	return {
		id: 'evt_test_123',
		object: 'event',
		type: 'checkout.session.completed',
		livemode: false,
		data: { object: (dataObject ?? {}) as Stripe.Event.Data['object'] },
		...overrides,
	} as Stripe.Event;
}

/** Minimal Stripe client so webhook tests never touch real `getStripe()` / env keys. */
const defaultWebhookStripe = makeStripeMock({});
const webhookPOST = createWebhookHandler({ stripe: defaultWebhookStripe });

describe('Stripe API Routes', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	beforeEach(async () => {
		vi.clearAllMocks();
	});

	describe('POST /api/v1/stripe/create-portal', () => {
		it('creates portal session for existing customer', async () => {
			const userId = await createAuthTestUser();
			await markUserAsSubscribed(userId, {
				subscriptionStatus: 'active',
			});

			const mockStripe = makeStripeMock({
				billingPortal: {
					sessions: {
						create: vi.fn().mockResolvedValue({
							url: 'https://billing.stripe.com/session_portal123',
						}),
					},
				},
			});

			const portalPOST = createCreatePortalHandler({ stripe: mockStripe });

			const request = new Request(
				'http://localhost/api/v1/stripe/create-portal',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Origin: 'http://localhost',
					},
					body: JSON.stringify({
						returnUrl: '/settings',
					}),
				},
			);

			const response = await portalPOST(request);

			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.portalUrl).toBe(
				'https://billing.stripe.com/session_portal123',
			);
		});

		it('returns 400 when no subscription lifecycle exists yet', async () => {
			const userId = await createAuthTestUser();
			const stripeCustomerId = buildStripeCustomerId(userId, 'portal-pending');
			await db
				.update(users)
				.set({ stripeCustomerId, subscriptionStatus: null })
				.where(sql`id = ${userId}`);

			const mockCreateSession = vi
				.fn()
				.mockRejectedValue(new Error('Should not be called'));
			const mockStripe = makeStripeMock({
				billingPortal: {
					sessions: {
						create: mockCreateSession,
					},
				},
			});
			const portalPOST = createCreatePortalHandler({ stripe: mockStripe });

			const request = new Request(
				'http://localhost/api/v1/stripe/create-portal',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({}),
				},
			);

			const response = await portalPOST(request);

			expect(response.status).toBe(400);
			expect(mockCreateSession).not.toHaveBeenCalled();
			await expect(response.json()).resolves.toMatchObject({
				error:
					'Billing portal is available after your first subscription checkout',
			});
		});

		it('creates portal session with empty POST body (optional JSON)', async () => {
			const userId = await createAuthTestUser();
			await markUserAsSubscribed(userId, {
				subscriptionStatus: 'active',
			});

			const mockStripe = makeStripeMock({
				billingPortal: {
					sessions: {
						create: vi.fn().mockResolvedValue({
							url: 'https://billing.stripe.com/session_empty_body',
						}),
					},
				},
			});

			const portalPOST = createCreatePortalHandler({ stripe: mockStripe });

			const request = new Request(
				'http://localhost/api/v1/stripe/create-portal',
				{
					method: 'POST',
				},
			);

			const response = await portalPOST(request);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.portalUrl).toBe(
				'https://billing.stripe.com/session_empty_body',
			);
			expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalled();
		});

		it('returns 400 for malformed JSON when content-type is application/json', async () => {
			const userId = await createAuthTestUser();
			await markUserAsSubscribed(userId, {
				subscriptionStatus: 'active',
			});

			const mockCreateSession = vi
				.fn()
				.mockRejectedValue(new Error('Should not be called'));
			const mockStripe = makeStripeMock({
				billingPortal: {
					sessions: {
						create: mockCreateSession,
					},
				},
			});
			const portalPOST = createCreatePortalHandler({ stripe: mockStripe });

			const request = new Request(
				'http://localhost/api/v1/stripe/create-portal',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: '{ not valid json',
				},
			);

			const response = await portalPOST(request);

			expect(response.status).toBe(400);
			expect(mockCreateSession).not.toHaveBeenCalled();
			await expect(response.json()).resolves.toMatchObject({
				error: 'Malformed JSON body',
			});
		});

		it.each([
			'https://evil.example/phish',
			'javascript:alert(1)',
			'//evil.example/phish',
			'http://localhost@evil.example',
		])('returns 400 when returnUrl is malicious: %s', async (returnUrl) => {
			const userId = await createAuthTestUser();
			await markUserAsSubscribed(userId, {
				stripeCustomerId: buildStripeCustomerId(userId, 'portal-external'),
				subscriptionStatus: 'active',
			});

			const mockCreateSession = vi
				.fn()
				.mockRejectedValue(new Error('Should not be called'));
			const mockStripe = makeStripeMock({
				billingPortal: {
					sessions: {
						create: mockCreateSession,
					},
				},
			});
			const portalPOST = createCreatePortalHandler({ stripe: mockStripe });

			const request = new Request(
				'http://localhost/api/v1/stripe/create-portal',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Origin: 'http://localhost',
					},
					body: JSON.stringify({
						returnUrl,
					}),
				},
			);

			const response = await portalPOST(request);

			expect(response.status).toBe(400);
			expect(mockCreateSession).not.toHaveBeenCalled();
			await expect(response.json()).resolves.toMatchObject({
				error: 'returnUrl must be a relative path or same-origin URL',
			});
		});
	});

	describe('POST /api/v1/stripe/webhook', () => {
		beforeEach(() => {
			vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test123');
		});

		it('handles checkout.session.completed event', async () => {
			const event = makeStripeEvent({
				id: 'evt_test123',
				type: 'checkout.session.completed',
				livemode: false,
				dataObject: {
					id: 'cs_test123',
					customer: 'cus_test123',
				},
			});

			const request = new Request('http://localhost/api/v1/stripe/webhook', {
				method: 'POST',
				headers: {
					'stripe-signature': 'test_signature',
				},
				body: JSON.stringify(event),
			});

			const constructEventSpy = vi
				.spyOn(Stripe.webhooks, 'constructEvent')
				.mockReturnValue(event);

			const response = await webhookPOST(request);

			expect(response.status).toBe(200);
			expect(constructEventSpy).toHaveBeenCalled();
		});

		it.each([
			{ cancelAtPeriodEnd: true, eventId: 'evt_sub_created_true' },
			{ cancelAtPeriodEnd: false, eventId: 'evt_sub_created_false' },
		])('handles subscription.created event and syncs cancelAtPeriodEnd=$cancelAtPeriodEnd to DB', async ({
			cancelAtPeriodEnd,
			eventId,
		}) => {
			const userId = await createAuthTestUser();
			const { stripeCustomerId } = await markUserAsSubscribed(userId, {
				subscriptionTier: 'free',
				subscriptionStatus: 'canceled',
			});
			const expectedSubscriptionId = buildStripeSubscriptionId(
				userId,
				'webhook-created',
			);

			const event = makeStripeEvent({
				id: eventId,
				type: 'customer.subscription.created',
				livemode: false,
				dataObject: makeStripeSubscription({
					id: expectedSubscriptionId,
					customer: stripeCustomerId,
					status: 'active',
					cancel_at_period_end: cancelAtPeriodEnd,
					items: {
						data: [
							{
								price: { id: 'price_starter' },
							},
						],
					},
					current_period_end: 1735689600,
				}),
			});

			const mockStripe = makeStripeMock({
				prices: {
					retrieve: vi.fn().mockResolvedValue({
						id: 'price_starter',
						product: {
							metadata: { tier: 'starter' },
						},
					}),
				},
			});

			const webhookPOSTWithMock = createWebhookHandler({ stripe: mockStripe });

			vi.spyOn(Stripe.webhooks, 'constructEvent').mockReturnValue(event);

			const createWebhookRequest = () =>
				new Request('http://localhost/api/v1/stripe/webhook', {
					method: 'POST',
					headers: {
						'stripe-signature': 'test_signature',
					},
					body: JSON.stringify(event),
				});

			const response = await webhookPOSTWithMock(createWebhookRequest());

			expect(response.status).toBe(200);

			const [user] = await db.select().from(users).where(sql`id = ${userId}`);
			expect(user?.subscriptionTier).toBe('starter');
			expect(user?.subscriptionStatus).toBe('active');
			expect(user?.stripeCustomerId).toBe(stripeCustomerId);
			expect(user?.stripeSubscriptionId).toBe(expectedSubscriptionId);
			expect(user?.subscriptionPeriodEnd).toEqual(new Date(1735689600 * 1000));
			expect(user?.cancelAtPeriodEnd).toBe(cancelAtPeriodEnd);
		});

		it('handles subscription.deleted event and downgrades to free', async () => {
			const userId = await createAuthTestUser();
			const { stripeCustomerId } = await markUserAsSubscribed(userId, {
				subscriptionTier: 'pro',
				subscriptionStatus: 'active',
			});
			await db
				.update(users)
				.set({ cancelAtPeriodEnd: true })
				.where(sql`id = ${userId}`);
			const expectedSubscriptionId = buildStripeSubscriptionId(
				userId,
				'webhook-deleted',
			);

			const event = makeStripeEvent({
				id: 'evt_sub_deleted',
				type: 'customer.subscription.deleted',
				livemode: false,
				dataObject: makeStripeSubscription({
					id: expectedSubscriptionId,
					customer: stripeCustomerId,
				}),
			});

			vi.spyOn(Stripe.webhooks, 'constructEvent').mockReturnValue(event);
			const webhookPOSTWithMock = createWebhookHandler({
				stripe: makeStripeMock({}),
			});

			const request = new Request('http://localhost/api/v1/stripe/webhook', {
				method: 'POST',
				headers: {
					'stripe-signature': 'test_signature',
				},
				body: JSON.stringify(event),
			});

			const response = await webhookPOSTWithMock(request);

			expect(response.status).toBe(200);

			// Verify downgraded to free
			const [user] = await db.select().from(users).where(sql`id = ${userId}`);
			expect(user?.subscriptionTier).toBe('free');
			expect(user?.subscriptionStatus).toBe('canceled');
			expect(user?.stripeSubscriptionId).toBeNull();
			expect(user?.cancelAtPeriodEnd).toBe(false);
		});

		it('handles invoice.payment_succeeded and resyncs the recovered subscription', async () => {
			const userId = await createAuthTestUser();
			const { stripeCustomerId } = await markUserAsSubscribed(userId, {
				subscriptionTier: 'starter',
				subscriptionStatus: 'past_due',
			});
			const expectedSubscriptionId = buildStripeSubscriptionId(
				userId,
				'webhook-paid',
			);

			const event = makeStripeEvent({
				id: 'evt_invoice_paid',
				type: 'invoice.payment_succeeded',
				livemode: false,
				dataObject: makeStripeInvoice({
					id: 'in_paid',
					customer: stripeCustomerId,
					subscription: expectedSubscriptionId,
				}),
			});

			const mockStripe = makeStripeMock({
				subscriptions: {
					retrieve: vi.fn().mockResolvedValue(
						makeStripeSubscription({
							id: expectedSubscriptionId,
							customer: stripeCustomerId,
							status: 'active',
							cancel_at_period_end: false,
							items: {
								data: [
									{
										price: { id: 'price_starter' },
									},
								],
							},
							current_period_end: 1735689600,
						}),
					),
				},
				prices: {
					retrieve: vi.fn().mockResolvedValue({
						id: 'price_starter',
						product: {
							metadata: { tier: 'starter' },
						},
					}),
				},
			});

			const webhookPOSTWithMock = createWebhookHandler({ stripe: mockStripe });

			vi.spyOn(Stripe.webhooks, 'constructEvent').mockReturnValue(event);

			const createWebhookRequest = () =>
				new Request('http://localhost/api/v1/stripe/webhook', {
					method: 'POST',
					headers: {
						'stripe-signature': 'test_signature',
					},
					body: JSON.stringify(event),
				});

			const response = await webhookPOSTWithMock(createWebhookRequest());

			expect(response.status).toBe(200);

			const [firstUser] = await db
				.select()
				.from(users)
				.where(sql`id = ${userId}`);
			expect(firstUser?.subscriptionTier).toBe('starter');
			expect(firstUser?.subscriptionStatus).toBe('active');
			expect(firstUser?.stripeSubscriptionId).toBe(expectedSubscriptionId);
			expect(firstUser?.subscriptionPeriodEnd).toEqual(
				new Date(1735689600 * 1000),
			);
			expect(firstUser?.cancelAtPeriodEnd).toBe(false);

			const secondResponse = await webhookPOSTWithMock(createWebhookRequest());
			expect(secondResponse.status).toBe(200);

			const [secondUser] = await db
				.select()
				.from(users)
				.where(sql`id = ${userId}`);
			expect(secondUser?.subscriptionTier).toBe(firstUser?.subscriptionTier);
			expect(secondUser?.subscriptionStatus).toBe(
				firstUser?.subscriptionStatus,
			);
			expect(secondUser?.stripeSubscriptionId).toBe(
				firstUser?.stripeSubscriptionId,
			);
			expect(secondUser?.subscriptionPeriodEnd).toEqual(
				firstUser?.subscriptionPeriodEnd,
			);
			expect(secondUser?.cancelAtPeriodEnd).toBe(firstUser?.cancelAtPeriodEnd);
		});

		it('returns 400 when signature missing', async () => {
			const request = new Request('http://localhost/api/v1/stripe/webhook', {
				method: 'POST',
				body: JSON.stringify({ type: 'test' }),
			});

			const response = await webhookPOST(request);

			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/v1/user/subscription', () => {
		it('returns subscription and usage data', async () => {
			const userId = await createAuthTestUser();

			await db
				.update(users)
				.set({
					subscriptionTier: 'pro',
					subscriptionStatus: 'active',
					subscriptionPeriodEnd: new Date('2025-12-31'),
					cancelAtPeriodEnd: true,
				})
				.where(sql`id = ${userId}`);

			const request = new Request('http://localhost/api/v1/user/subscription', {
				method: 'GET',
			});

			const response = await subscriptionGET(request);

			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.tier).toBe('pro');
			expect(body.status).toBe('active');
			expect(body.cancelAtPeriodEnd).toBe(true);
			expect(body.usage).toBeDefined();
			expect(body.usage.activePlans).toBeDefined();
			expect(body.usage.regenerations).toBeDefined();
			expect(body.usage.exports).toBeDefined();
		});

		it('returns 401 when not authenticated', async () => {
			setTestUser('');

			const request = new Request('http://localhost/api/v1/user/subscription', {
				method: 'GET',
			});

			const response = await subscriptionGET(request);

			expect(response.status).toBe(401);
		});
	});

	describe('GET /api/v1/stripe/local/complete-checkout', () => {
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		it('returns 401 when not authenticated', async () => {
			vi.stubEnv('STRIPE_LOCAL_MODE', 'true');
			vi.stubEnv('LOCAL_PRODUCT_TESTING', 'true');
			clearTestUser();

			const url = new URL(
				'http://localhost/api/v1/stripe/local/complete-checkout',
			);
			url.searchParams.set('price_id', LOCAL_PRICE_IDS.starterMonthly);
			url.searchParams.set('next', '/settings/billing');

			const response = await localCompleteCheckoutGET(
				new Request(url.toString()),
			);

			expect(response.status).toBe(401);
		});

		it('returns 404 when local completion route is disabled', async () => {
			vi.stubEnv('STRIPE_LOCAL_MODE', 'false');
			vi.stubEnv('LOCAL_PRODUCT_TESTING', 'false');

			await createAuthTestUser();

			const url = new URL(
				'http://localhost/api/v1/stripe/local/complete-checkout',
			);
			url.searchParams.set('price_id', LOCAL_PRICE_IDS.starterMonthly);
			url.searchParams.set('next', '/settings/billing');

			const response = await localCompleteCheckoutGET(
				new Request(url.toString()),
			);

			expect(response.status).toBe(404);
		});

		it('returns 400 when price_id is not a local catalog id', async () => {
			vi.stubEnv('STRIPE_LOCAL_MODE', 'true');
			vi.stubEnv('LOCAL_PRODUCT_TESTING', 'true');

			await createAuthTestUser();

			const url = new URL(
				'http://localhost/api/v1/stripe/local/complete-checkout',
			);
			url.searchParams.set('price_id', 'price_unknown_not_local');
			url.searchParams.set('next', '/settings/billing');

			const response = await localCompleteCheckoutGET(
				new Request(url.toString()),
			);

			expect(response.status).toBe(400);
		});
	});
});
