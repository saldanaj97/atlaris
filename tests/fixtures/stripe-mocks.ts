import type Stripe from 'stripe';
import { vi } from 'vitest';

/**
 * Subset of the Stripe SDK we actually exercise from tests. Only methods on
 * these namespaces ever get mocked; widening this is fine when a new test
 * needs additional surface area.
 */
export type LocalStripe = Pick<
	Stripe,
	'customers' | 'checkout' | 'billingPortal' | 'prices' | 'subscriptions'
>;

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Build a Stripe SDK mock that satisfies the typed `LocalStripe` surface.
 * Pass a partial shape to override individual namespaces or methods. Any
 * method not provided becomes a `vi.fn()` that throws if invoked, surfacing
 * unexpected SDK calls instead of silently returning `undefined`.
 *
 * Cast the return value to `Stripe` at the test boundary if a function
 * signature requires the full type — this is the one place that cast lives,
 * which is preferable to scattering `as unknown as Stripe` across every spec.
 */
export function makeStripeMock(partial: DeepPartial<LocalStripe> = {}): Stripe {
	const fallback = (namespace: string, method: string) =>
		vi.fn().mockImplementation(() => {
			throw new Error(
				`makeStripeMock: ${namespace}.${method}() called but no implementation was provided. Pass it in the partial argument.`,
			);
		});

	const buildNamespace = <T>(
		name: string,
		overrides: Partial<T> | undefined,
		methods: ReadonlyArray<keyof T & string>,
	): T => {
		const base = {} as Record<string, unknown>;
		for (const method of methods) {
			base[method] =
				(overrides as Record<string, unknown> | undefined)?.[method] ??
				fallback(name, method);
		}
		return base as T;
	};

	const customers = buildNamespace<Stripe['customers']>(
		'customers',
		partial.customers as Partial<Stripe['customers']> | undefined,
		['create', 'update', 'retrieve', 'del'] as const,
	);
	const checkout = {
		sessions: buildNamespace<Stripe['checkout']['sessions']>(
			'checkout.sessions',
			(
				partial.checkout as
					| { sessions?: Partial<Stripe['checkout']['sessions']> }
					| undefined
			)?.sessions,
			['create', 'retrieve', 'list', 'expire'] as const,
		),
	} as Stripe['checkout'];
	const billingPortal = {
		sessions: buildNamespace<Stripe['billingPortal']['sessions']>(
			'billingPortal.sessions',
			(
				partial.billingPortal as
					| { sessions?: Partial<Stripe['billingPortal']['sessions']> }
					| undefined
			)?.sessions,
			['create'] as const,
		),
	} as Stripe['billingPortal'];
	const prices = buildNamespace<Stripe['prices']>(
		'prices',
		partial.prices as Partial<Stripe['prices']> | undefined,
		['create', 'retrieve', 'list', 'update'] as const,
	);
	const subscriptions = buildNamespace<Stripe['subscriptions']>(
		'subscriptions',
		partial.subscriptions as Partial<Stripe['subscriptions']> | undefined,
		['create', 'retrieve', 'update', 'cancel', 'list'] as const,
	);

	return {
		customers,
		checkout,
		billingPortal,
		prices,
		subscriptions,
	} as Stripe;
}

/**
 * Build a partial Stripe.Subscription object that satisfies the type plus the
 * `current_period_end` field. The project pins SDK typings for compatibility,
 * so tests keep this wire field explicit until the pinned type includes it.
 *
 * @see {@link ../../src/features/billing/stripe-commerce/reconciliation}
 */
export function makeStripeSubscription(
	partial: DeepPartial<Stripe.Subscription> & {
		current_period_end?: number;
	} = {},
): Stripe.Subscription & { current_period_end?: number } {
	return {
		id: partial.id ?? 'sub_test',
		object: 'subscription',
		status: 'active',
		cancel_at_period_end: false,
		customer: partial.customer ?? 'cus_test',
		items: { object: 'list', data: [], has_more: false, url: '' },
		metadata: {},
		...partial,
	} as Stripe.Subscription & { current_period_end?: number };
}

/**
 * Build a partial Stripe.Invoice object suitable for webhook test fixtures.
 */
export function makeStripeInvoice(
	partial: DeepPartial<Stripe.Invoice> = {},
): Stripe.Invoice {
	return {
		id: partial.id ?? 'in_test',
		object: 'invoice',
		customer: partial.customer ?? 'cus_test',
		status: 'paid',
		paid: true,
		metadata: {},
		...partial,
	} as Stripe.Invoice;
}
