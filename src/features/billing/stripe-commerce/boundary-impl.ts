import Stripe from 'stripe';
import { z } from 'zod';
import { canOpenBillingPortalForUser } from '@/features/billing/portal-eligibility';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';
import { assertCheckoutPriceAllowed } from '@/features/billing/stripe-commerce/price-policy';
import { applyVerifiedEvent } from '@/features/billing/stripe-commerce/reconciliation';
import {
  isValidRedirectUrl,
  resolveRedirectUrl,
} from '@/features/billing/stripe-commerce/redirect';
import type {
  AcceptWebhookInput,
  BeginCheckoutInput,
  OpenPortalInput,
  StripeCommerceBoundary,
  StripeWebhookResponse,
} from '@/features/billing/stripe-commerce/types';
import { createCustomer } from '@/features/billing/subscriptions';
import { AppError, extractErrorCode, ValidationError } from '@/lib/api/errors';
import type { users } from '@/lib/db/schema';
import type { db as serviceRoleDb } from '@/lib/db/service-role';
import type { DbClient } from '@/lib/db/types';

const DEFAULT_CHECKOUT_SUCCESS =
  '/settings/billing?session_id={CHECKOUT_SESSION_ID}';
const DEFAULT_CHECKOUT_CANCEL = '/settings/billing';
const DEFAULT_PORTAL_RETURN = '/settings/billing';

const WEBHOOK_MAX_BYTES = 256 * 1024;

const devWebhookEventSchema = z.object({ type: z.string() });

type ServiceRoleDb = typeof serviceRoleDb;

export type StripeCommerceBoundaryDeps = {
  gateway: StripeGateway;
  localMode: boolean;
  getDb: () => DbClient;
  serviceRoleDb: ServiceRoleDb;
  users: typeof users;
  webhookSecret: string | null;
  webhookDevMode: boolean;
  isProduction: boolean;
  isDevOrTest: boolean;
};

export class DefaultStripeCommerceBoundary implements StripeCommerceBoundary {
  constructor(private readonly deps: StripeCommerceBoundaryDeps) {}

  async beginCheckout(
    input: BeginCheckoutInput,
  ): Promise<{ sessionUrl: string }> {
    const { priceId, successUrl, cancelUrl } = input;
    assertCheckoutPriceAllowed(this.deps.localMode, priceId);

    if (!isValidRedirectUrl(successUrl)) {
      throw new ValidationError(
        'successUrl must be a relative path or same-origin URL',
      );
    }

    if (!isValidRedirectUrl(cancelUrl)) {
      throw new ValidationError(
        'cancelUrl must be a relative path or same-origin URL',
      );
    }

    const stripe = this.deps.gateway.getStripeClient();
    const customerId = await createCustomer(
      input.actor.userId,
      input.actor.email,
      stripe,
      this.deps.getDb(),
    );

    const successResolved = resolveRedirectUrl(
      successUrl,
      DEFAULT_CHECKOUT_SUCCESS,
    );
    const cancelResolved = resolveRedirectUrl(
      cancelUrl,
      DEFAULT_CHECKOUT_CANCEL,
    );

    let sessionUrl: string | null = null;
    try {
      const session = await this.deps.gateway.createCheckoutSession({
        customerId,
        priceId,
        successUrl: successResolved,
        cancelUrl: cancelResolved,
      });
      sessionUrl = session.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stripeType =
        error instanceof Stripe.errors.StripeError ? error.type : undefined;
      const stripeCode =
        error instanceof Stripe.errors.StripeError ? error.code : undefined;

      const isClientError =
        stripeType === 'StripeInvalidRequestError' ||
        stripeCode === 'resource_missing';

      throw new AppError(
        isClientError
          ? 'Invalid checkout request. Please check the plan and try again.'
          : 'Unable to start checkout. Please try again later.',
        {
          status: isClientError ? 400 : 500,
          code: 'STRIPE_CHECKOUT_SESSION_CREATION_FAILED',
          cause: error,
          logMeta: {
            userId: input.actor.userId,
            priceId,
            stripeErrorMessage: message,
            stripeType,
            stripeCode,
          },
        },
      );
    }

    if (!sessionUrl) {
      throw new AppError('Failed to create checkout session', {
        status: 500,
        code: 'STRIPE_CHECKOUT_SESSION_CREATION_FAILED',
        logMeta: { userId: input.actor.userId },
      });
    }

    return { sessionUrl };
  }

  async openPortal(input: OpenPortalInput): Promise<{ portalUrl: string }> {
    const actor = input.actor;

    if (
      !canOpenBillingPortalForUser({
        stripeCustomerId: actor.stripeCustomerId,
        subscriptionStatus: actor.subscriptionStatus,
      })
    ) {
      throw new ValidationError(
        'Billing portal is available after your first subscription checkout',
      );
    }

    if (!isValidRedirectUrl(input.returnUrl)) {
      throw new ValidationError(
        'returnUrl must be a relative path or same-origin URL',
        undefined,
        { userId: actor.userId, returnUrl: input.returnUrl },
      );
    }

    const resolvedReturnUrl = resolveRedirectUrl(
      input.returnUrl,
      DEFAULT_PORTAL_RETURN,
    );

    const stripeCustomerId = actor.stripeCustomerId;
    if (!stripeCustomerId) {
      throw new ValidationError(
        'Billing portal is available after your first subscription checkout',
      );
    }

    let portalUrl: string | null = null;
    try {
      const session = await this.deps.gateway.createBillingPortalSession({
        customerId: stripeCustomerId,
        returnUrl: resolvedReturnUrl,
      });
      portalUrl = session.url;
    } catch (error) {
      const stripeErrorCode = extractErrorCode(error);
      throw new AppError('Failed to create customer portal session', {
        status: 500,
        code: 'STRIPE_PORTAL_SESSION_CREATION_FAILED',
        cause: error,
        logMeta: {
          userId: actor.userId,
          stripeCustomerId: actor.stripeCustomerId,
          resolvedReturnUrl,
          stripeErrorCode,
          stripeErrorMessage:
            error instanceof Error ? error.message : String(error),
        },
      });
    }

    if (!portalUrl) {
      throw new AppError('Failed to create customer portal session', {
        status: 500,
        code: 'STRIPE_PORTAL_SESSION_CREATION_FAILED',
        logMeta: {
          userId: actor.userId,
          stripeCustomerId: actor.stripeCustomerId,
          resolvedReturnUrl,
        },
      });
    }

    return { portalUrl };
  }

  async acceptWebhook(
    input: AcceptWebhookInput,
  ): Promise<StripeWebhookResponse> {
    const { rawBody, signatureHeader, contentLength, logger } = input;

    if (contentLength !== undefined && contentLength !== null) {
      if (Number.isFinite(contentLength) && contentLength > WEBHOOK_MAX_BYTES) {
        logger.warn(
          {
            contentLength,
            maxBytes: WEBHOOK_MAX_BYTES,
          },
          'Stripe webhook payload too large (content-length)',
        );
        return { status: 413, body: 'payload too large' };
      }
    }

    const bodySize = Buffer.byteLength(rawBody, 'utf8');
    if (bodySize > WEBHOOK_MAX_BYTES) {
      logger.warn(
        { bodySize, maxBytes: WEBHOOK_MAX_BYTES },
        'Stripe webhook payload too large',
      );
      return { status: 413, body: 'payload too large' };
    }

    const webhookSecret = this.deps.webhookSecret;
    const allowDevPayloads = this.deps.isDevOrTest && this.deps.webhookDevMode;

    let event: import('stripe').Stripe.Event;

    if (webhookSecret) {
      if (!signatureHeader) {
        logger.warn('Stripe webhook missing signature');
        return { status: 400, body: 'missing signature' };
      }

      try {
        const constructed = this.deps.gateway.constructWebhookEvent({
          rawBody,
          signature: signatureHeader,
          secret: webhookSecret,
          toleranceSeconds: 300,
        });
        event = constructed.stripeEvent;
      } catch (error) {
        logger.error({ error }, 'Stripe webhook signature verification failed');
        return { status: 400, body: 'signature verification failed' };
      }
    } else {
      if (!allowDevPayloads) {
        logger.error(
          'Stripe webhook misconfigured: missing secret outside development',
        );
        return { status: 500, body: 'webhook misconfigured' };
      }

      let devParsed: unknown;
      try {
        devParsed = JSON.parse(rawBody);
      } catch {
        return { status: 400, body: 'bad request' };
      }

      const devParseResult = devWebhookEventSchema.safeParse(devParsed);
      if (!devParseResult.success) {
        return { status: 400, body: 'bad request' };
      }

      logger.info(
        { type: devParseResult.data.type },
        'Stripe webhook dev mode event received (noop)',
      );
      return { status: 200, body: 'ok' };
    }

    const expectLive = this.deps.isProduction;
    if (event.livemode !== expectLive) {
      logger.warn(
        {
          eventId: event.id,
          eventType: event.type,
          eventLivemode: event.livemode,
          expectLive,
        },
        'Stripe webhook livemode mismatch',
      );
      return { status: 200, body: 'ok' };
    }

    const gateway = this.deps.gateway;
    const stripe = gateway.getStripeClient();

    const dedupeResult = await applyVerifiedEvent(event, {
      stripe,
      gateway,
      logger,
      users: this.deps.users,
      db: this.deps.serviceRoleDb,
    });

    return {
      status: 200,
      body: 'ok',
      duplicate: dedupeResult === 'duplicate',
    };
  }
}
