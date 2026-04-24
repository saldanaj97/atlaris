import type Stripe from 'stripe';
import { z } from 'zod';
import {
	createStripeCommerceBoundary,
	getStripeCommerceBoundary,
	type StripeCommerceBoundary,
} from '@/features/billing/stripe-commerce';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import type { PlainHandler } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { getFirstZodIssueMessage } from '@/lib/api/zod-issue';

const createCheckoutBodySchema = z
	.object({
		priceId: z
			.string({ message: 'priceId is required' })
			.min(1, 'priceId is required'),
		successUrl: z.string().optional(),
		cancelUrl: z.string().optional(),
	})
	.strict();

/**
 * Factory deps for `createCreateCheckoutHandler`. The default `POST` export uses none; tests
 * and harnesses set `boundary` or, for narrow compatibility, `stripe` to build a boundary via
 * `createStripeCommerceBoundary({ gateway: new LiveStripeGateway(stripe) })` without wiring
 * a full mock boundary. Prefer `boundary` when you have one.
 */
export type CreateCheckoutHandlerDeps = {
	boundary?: StripeCommerceBoundary;
	/** @deprecated Prefer `boundary`; use only when the harness only has a raw `Stripe` client. */
	stripe?: Stripe;
};

/**
 * Factory for the create-checkout POST handler.
 */
export function createCreateCheckoutHandler(
	deps: CreateCheckoutHandlerDeps = {},
): PlainHandler {
	return withErrorBoundary(
		requestBoundary.route({ rateLimit: 'billing' }, async ({ req, actor }) => {
			const body = await parseJsonBody(req, {
				mode: 'required',
				onMalformedJson: () =>
					new ValidationError('Invalid JSON in request body'),
			});

			const parseResult = createCheckoutBodySchema.safeParse(body);
			if (!parseResult.success) {
				throw new ValidationError(
					getFirstZodIssueMessage(parseResult.error) ?? 'Invalid request body',
				);
			}

			const { priceId, successUrl, cancelUrl } = parseResult.data;

			const boundary =
				deps.boundary ??
				(deps.stripe
					? createStripeCommerceBoundary({
							gateway: new LiveStripeGateway(deps.stripe),
						})
					: getStripeCommerceBoundary());

			const { sessionUrl } = await boundary.beginCheckout({
				actor: { userId: actor.id, email: actor.email },
				priceId,
				successUrl,
				cancelUrl,
			});

			return json({ sessionUrl });
		}),
	);
}

export const POST = createCreateCheckoutHandler();
