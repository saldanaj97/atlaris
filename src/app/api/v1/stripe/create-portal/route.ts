import type Stripe from 'stripe';
import { z } from 'zod';
import {
	createStripeCommerceBoundary,
	getStripeCommerceBoundary,
	type StripeCommerceBoundary,
} from '@/features/billing/stripe-commerce';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { json } from '@/lib/api/response';
import { getFirstZodIssueMessage } from '@/lib/api/zod-issue';
import { logger } from '@/lib/logging/logger';

const createPortalBodySchema = z.object({
	returnUrl: z.string().optional(),
});

export type CreatePortalHandlerDeps = {
	boundary?: StripeCommerceBoundary;
	/** @deprecated Prefer `boundary`; builds a boundary with this Stripe client for tests */
	stripe?: Stripe;
	parseJsonBody?: typeof parseJsonBody;
};

/**
 * Factory for the create-portal POST handler.
 */
export function createCreatePortalHandler(deps: CreatePortalHandlerDeps = {}) {
	const parseJsonBodyImpl = deps.parseJsonBody ?? parseJsonBody;

	return withErrorBoundary(
		withAuthAndRateLimit('billing', async ({ req, user }) => {
			logger.info(
				{
					userId: user.id,
					authUserId: user.authUserId,
					subscriptionTier: user.subscriptionTier,
				},
				'billing portal attempt',
			);

			const body = await parseJsonBodyImpl(req, {
				mode: 'optional',
				fallback: {},
				onMalformedJson: (err) =>
					new ValidationError('Malformed JSON body', undefined, {
						userId: user.id,
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
						userId: user.id,
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
					userId: user.id,
					stripeCustomerId: user.stripeCustomerId,
					subscriptionStatus: user.subscriptionStatus,
				},
				returnUrl,
			});

			return json({ portalUrl });
		}),
	);
}

export const POST = createCreatePortalHandler();
