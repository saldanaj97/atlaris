import type Stripe from 'stripe';
import {
	createStripeCommerceBoundary,
	getStripeCommerceBoundary,
	type StripeCommerceBoundary,
} from '@/features/billing/stripe-commerce';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import type { PlainHandler } from '@/lib/api/auth';
import { RateLimitError } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/middleware';
import { appEnv, stripeEnv } from '@/lib/config/env';
import {
	attachRequestIdHeader,
	createRequestContext,
} from '@/lib/logging/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Startup validation: STRIPE_WEBHOOK_DEV_MODE must only be enabled in development/test
if (stripeEnv.webhookDevMode && !(appEnv.isDevelopment || appEnv.isTest)) {
	throw new Error(
		'STRIPE_WEBHOOK_DEV_MODE is enabled outside development/test. This is a misconfiguration.',
	);
}

export type WebhookHandlerDeps = {
	boundary?: StripeCommerceBoundary;
	/** @deprecated Prefer `boundary`; builds a boundary with this Stripe client for tests */
	stripe?: Stripe;
};

/**
 * Factory for the webhook POST handler.
 */
export function createWebhookHandler(
	deps: WebhookHandlerDeps = {},
): PlainHandler {
	return withErrorBoundary(async (req: Request) => {
		const { requestId, logger } = createRequestContext(req, {
			route: 'stripe_webhook',
		});
		const respond = (body: BodyInit | null, init?: ResponseInit) =>
			attachRequestIdHeader(new Response(body, init), requestId);

		try {
			checkIpRateLimit(req, 'webhook');
		} catch (error) {
			if (error instanceof RateLimitError) {
				logger.warn(
					{
						event: 'stripe_webhook_rate_limited',
						requestId,
					},
					'Stripe webhook rate limited',
				);
				return respond('rate limited', { status: 429 });
			}
			throw error;
		}

		const contentLengthHeader = req.headers.get('content-length');
		const contentLengthParsed =
			contentLengthHeader !== null ? Number(contentLengthHeader) : Number.NaN;
		const contentLength =
			Number.isFinite(contentLengthParsed) && contentLengthParsed >= 0
				? contentLengthParsed
				: null;

		const rawBody = await req.text();

		const boundary =
			deps.boundary ??
			(deps.stripe
				? createStripeCommerceBoundary({
						gateway: new LiveStripeGateway(deps.stripe),
					})
				: getStripeCommerceBoundary());

		const result = await boundary.acceptWebhook({
			rawBody,
			signatureHeader: req.headers.get('stripe-signature'),
			contentLength,
			logger,
			stripe: deps.stripe,
		});

		return respond(result.body, { status: result.status });
	});
}

export const POST = createWebhookHandler();
