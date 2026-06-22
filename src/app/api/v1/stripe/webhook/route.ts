import type { StripeCommerceBoundary } from '@/features/billing/stripe-commerce/types';
import type { PlainHandler } from '@/lib/api/auth';

import { getLazyStripeCommerceBoundary } from '@/features/billing/stripe-commerce/factory';
import { RateLimitError } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { appEnv, stripeEnv } from '@/lib/config/env';
import {
  attachRequestIdHeader,
  createLoggingRequestContext,
} from '@/lib/logging/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEBHOOK_MAX_BYTES = 256 * 1024;

async function readUtf8BodyCapped(req: Request): Promise<string | null> {
  if (!req.body) {
    return '';
  }

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return body + decoder.decode();
    }

    bytesRead += value.byteLength;
    if (bytesRead > WEBHOOK_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
}

// Startup validation: STRIPE_WEBHOOK_DEV_MODE must only be enabled in development/test
if (stripeEnv.webhookDevMode && !(appEnv.isDevelopment || appEnv.isTest)) {
  throw new Error(
    'STRIPE_WEBHOOK_DEV_MODE is enabled outside development/test. This is a misconfiguration.',
  );
}

/**
 * Factory deps for `createWebhookHandler`. Default `POST` uses `getLazyStripeCommerceBoundary()`;
 * tests and custom runtimes pass an explicit commerce boundary.
 */
type WebhookHandlerDeps = {
  boundary: StripeCommerceBoundary;
};

/**
 * Factory for the webhook POST handler.
 */
export function createWebhookHandler(deps: WebhookHandlerDeps): PlainHandler {
  return withErrorBoundary(async (req: Request) => {
    const { requestId, logger } = createLoggingRequestContext(req, {
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

    const signatureHeader = req.headers.get('stripe-signature');
    if (!signatureHeader) {
      logger.warn('Stripe webhook missing signature');
      return respond('missing signature', { status: 400 });
    }

    const contentLengthHeader = req.headers.get('content-length');
    const contentLengthParsed =
      contentLengthHeader !== null ? Number(contentLengthHeader) : Number.NaN;
    const contentLength =
      Number.isFinite(contentLengthParsed) && contentLengthParsed >= 0
        ? contentLengthParsed
        : null;

    if (contentLength !== null && contentLength > WEBHOOK_MAX_BYTES) {
      logger.warn(
        { contentLength, maxBytes: WEBHOOK_MAX_BYTES },
        'Stripe webhook payload too large (content-length)',
      );
      return respond('payload too large', { status: 413 });
    }

    const rawBody = await readUtf8BodyCapped(req);
    if (rawBody === null) {
      logger.warn(
        { maxBytes: WEBHOOK_MAX_BYTES },
        'Stripe webhook payload too large while streaming',
      );
      return respond('payload too large', { status: 413 });
    }

    const result = await deps.boundary.acceptWebhook({
      rawBody,
      signatureHeader,
      contentLength,
      logger,
    });

    return respond(result.body, { status: result.status });
  });
}

export const POST = createWebhookHandler({
  boundary: getLazyStripeCommerceBoundary(),
});
