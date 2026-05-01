import {
  createStripeCommerceBoundary,
  getStripeCommerceBoundary,
} from '@/features/billing/stripe-commerce/factory';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import type { StripeCommerceBoundary } from '@/features/billing/stripe-commerce/types';
import { ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { getFirstZodIssueMessage } from '@/lib/api/zod-issue';
import { logger } from '@/lib/logging/logger';
import type Stripe from 'stripe';
import { z } from 'zod';

const createPortalBodySchema = z.object({
  returnUrl: z.string().optional(),
});

/**
 * Factory deps for `createCreatePortalHandler`: the module's default `POST` export uses
 * default dependencies; callers may pass custom dependencies (e.g., stripe or boundary)
 * for testing or custom runtime behavior.
 */
type CreatePortalHandlerDeps = {
  boundary?: StripeCommerceBoundary;
  /** @deprecated Prefer `boundary`; fallback for test harnesses with only a raw `Stripe` client. */
  stripe?: Stripe;
  parseJsonBody?: typeof parseJsonBody;
};

function assertRawStripeAllowed(): void {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    process.env.ALLOW_RAW_STRIPE === 'true'
  ) {
    return;
  }

  throw new Error(
    'Deprecated stripe dependency is only allowed in test/dev contexts; pass boundary instead.',
  );
}

function getReturnUrlForLog(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('returnUrl' in body)) {
    return undefined;
  }

  const { returnUrl } = body as { returnUrl?: unknown };
  return typeof returnUrl === 'string' ? returnUrl : undefined;
}

/**
 * Factory for the create-portal POST handler.
 */
export function createCreatePortalHandler(deps: CreatePortalHandlerDeps = {}) {
  const parseJsonBodyImpl = deps.parseJsonBody ?? parseJsonBody;

  return requestBoundary.route(
    { rateLimit: 'billing' },
    async ({ req, actor }) => {
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
        const firstMessage = getFirstZodIssueMessage(parseResult.error);
        throw new ValidationError(
          firstMessage ?? 'Invalid request body',
          undefined,
          {
            userId: actor.id,
            returnUrl: getReturnUrlForLog(body),
            validationMessage: firstMessage,
          },
        );
      }

      const { returnUrl } = parseResult.data;

      let boundary = deps.boundary;
      if (!boundary && deps.stripe) {
        assertRawStripeAllowed();
        boundary = createStripeCommerceBoundary({
          gateway: new LiveStripeGateway(deps.stripe),
        });
      }
      boundary ??= getStripeCommerceBoundary();

      const { portalUrl } = await boundary.openPortal({
        actor: {
          userId: actor.id,
          stripeCustomerId: actor.stripeCustomerId,
          subscriptionStatus: actor.subscriptionStatus,
        },
        returnUrl,
      });

      return json({ portalUrl });
    },
  );
}

export const POST = createCreatePortalHandler();
