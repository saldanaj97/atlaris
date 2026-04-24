import type Stripe from 'stripe';
import { z } from 'zod';
import {
	createStripeCommerceBoundary,
	getStripeCommerceBoundary,
	type StripeCommerceBoundary,
} from '@/features/billing/stripe-commerce';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { getFirstZodIssueMessage } from '@/lib/api/zod-issue';
import { logger } from '@/lib/logging/logger';

const createPortalBodySchema = z.object({
	returnUrl: z.string().optional(),
});

/**
 * Factory deps for `createCreatePortalHandler`. Same story as create-checkout: production uses
 * defaults; tests may inject `boundary` or the deprecated `stripe` shortcut for
 * `LiveStripeGateway` construction.
 */
export type CreatePortalHandlerDeps = {
	boundary?: StripeCommerceBoundary;
	/** @deprecated Prefer `boundary`; use only when the harness only has a raw `Stripe` client. */
	stripe?: Stripe;
	parseJsonBody?: typeof parseJsonBody;
};

/**
 * Factory for the create-portal POST handler.
 */
export function createCreatePortalHandler(deps: CreatePortalHandlerDeps = {}) {
	const parseJsonBodyImpl = deps.parseJsonBody ?? parseJsonBody;

	return withErrorBoundary(
		requestBoundary.route({ rateLimit: 'billing' }, async ({ req, actor }) => {
			logger.info(
				{
					userId: actor.id,
					authUserId: actor.authUserId,
					subscriptionTier: actor.subscriptionTier,
				},
				'billing portal attempt',
			);

			const body = await parseJsonBodyImpl(req, {
				mode: 'optional',
				fallback: {},
				onMalformedJson: (err) =>
					new ValidationError('Malformed JSON body', undefined, {
						userId: actor.id,
						parseError: err instanceof Error ? err.message : String(err),
					}),
			});

			const parseResult = createPortalBodySchema.safeParse(body);
			if (!parseResult.success) {
				const rawReturnUrl =
					typeof body === 'object' &&
					body !== null &&
					'returnUrl' in body &&
					typeof (body as { returnUrl?: unknown }).returnUrl === 'string'
						? (body as { returnUrl: string }).returnUrl
						: undefined;
				const firstMessage = getFirstZodIssueMessage(parseResult.error);
				throw new ValidationError(
					firstMessage ?? 'Invalid request body',
					undefined,
					{
						userId: actor.id,
						returnUrl: rawReturnUrl,
						validationMessage: firstMessage,
					},
				);
			}

			const { returnUrl } = parseResult.data;

			const boundary =
				deps.boundary ??
				(deps.stripe
					? createStripeCommerceBoundary({
							gateway: new LiveStripeGateway(deps.stripe),
						})
					: getStripeCommerceBoundary());

			const { portalUrl } = await boundary.openPortal({
				actor: {
					userId: actor.id,
					stripeCustomerId: actor.stripeCustomerId,
					subscriptionStatus: actor.subscriptionStatus,
				},
				returnUrl,
			});

			return json({ portalUrl });
		}),
	);
}

export const POST = createCreatePortalHandler();
