import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import {
  applyPaymentFailed,
  applySubscriptionDeleted,
  applySubscriptionSync,
} from '@/features/billing/account-transitions';
import { stripeWebhookEvents } from '@/lib/db/schema';
import { db as serviceRoleDb } from '@/lib/db/service-role';
import type { createLogger } from '@/lib/logging/logger';

type Logger = ReturnType<typeof createLogger>;
const STRIPE_SYNC_TIMEOUT_MS = 10_000;

export type StripeWebhookSideEffectDeps = {
  stripe?: Stripe;
  logger: Logger;
  db?: typeof import('@/lib/db/service-role').db;
  users: typeof import('@/lib/db/schema').users;
};

function withTimeout<T>(
  timeoutMs: number,
  callback: (signal: AbortSignal) => Promise<T>
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

/**
 * Applies a verified Stripe event after idempotency insert succeeded.
 * Used by the production webhook route and local billing completion flow.
 */
export async function applyStripeWebhookEvent(
  event: Stripe.Event,
  deps: StripeWebhookSideEffectDeps
): Promise<void> {
  const { stripe: stripeInstance, logger } = deps;
  const transitionDeps = { ...deps, db: deps.db ?? serviceRoleDb };

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
        })
      );
      logger.info(
        {
          type: event.type,
        },
        'Stripe subscription sync webhook processed'
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await withTimeout(STRIPE_SYNC_TIMEOUT_MS, async () =>
        applySubscriptionDeleted(subscription, transitionDeps)
      );
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await withTimeout(STRIPE_SYNC_TIMEOUT_MS, async () =>
        applyPaymentFailed(invoice, transitionDeps)
      );
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id;

      if (!subscriptionId || !stripeInstance) {
        const message = !subscriptionId
          ? 'invoice.payment_succeeded missing subscription id for resync'
          : 'invoice.payment_succeeded cannot resync without Stripe client';

        logger.error(
          {
            eventId: event.id,
            subscriptionId: subscriptionId ?? null,
            hasStripeClient: Boolean(stripeInstance),
          },
          message
        );
        throw new Error(`${message} (eventId=${event.id})`);
      }

      let subscription: Stripe.Subscription;
      try {
        subscription = await stripeInstance.subscriptions.retrieve(
          subscriptionId,
          { timeout: STRIPE_SYNC_TIMEOUT_MS }
        );
      } catch (error) {
        logger.error(
          {
            eventId: event.id,
            subscriptionId,
            operation: 'subscriptions.retrieve',
            ...getStripeErrorMeta(error),
          },
          'Failed to retrieve Stripe subscription during invoice.payment_succeeded resync'
        );
        throw error;
      }

      try {
        await withTimeout(STRIPE_SYNC_TIMEOUT_MS, async (signal) =>
          applySubscriptionSync(subscription, transitionDeps, {
            signal,
            timeoutMs: STRIPE_SYNC_TIMEOUT_MS,
          })
        );
      } catch (error) {
        logger.error(
          {
            eventId: event.id,
            subscriptionId,
            operation: 'syncSubscriptionToDb',
            ...getStripeErrorMeta(error),
          },
          'Failed to sync subscription during invoice.payment_succeeded resync'
        );
        throw error;
      }

      logger.info(
        {
          eventId: event.id,
          subscriptionId,
        },
        'Stripe invoice.payment_succeeded webhook processed'
      );
      break;
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe webhook event');
      break;
  }
}

/**
 * Idempotent insert + apply + rollback on failure (matches production webhook route).
 */
export async function handleStripeWebhookDedupeAndApply(
  event: Stripe.Event,
  deps: StripeWebhookSideEffectDeps
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
      'Duplicate Stripe webhook event skipped'
    );
    return 'duplicate';
  }

  try {
    await applyStripeWebhookEvent(event, deps);
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
        'Failed to rollback Stripe webhook event record after processing error'
      );
    }

    deps.logger.error(
      {
        eventType: event.type,
        eventId: event.id,
        error,
      },
      'Stripe webhook processing failed; event record rolled back'
    );
    throw error;
  }

  return 'inserted';
}
