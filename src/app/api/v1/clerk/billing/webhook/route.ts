import type { PlainHandler } from '@/lib/api/auth';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import { applyVerifiedClerkBillingEvent } from '@/features/billing/clerk-billing/reconciliation';
import { RateLimitError } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { clerkAuthEnv } from '@/lib/config/env';
import {
  attachRequestIdHeader,
  createLoggingRequestContext,
} from '@/lib/logging/request-context';
import { verifyWebhook } from '@clerk/nextjs/webhooks';

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

function createClerkBillingWebhookHandler(): PlainHandler {
  return withErrorBoundary(async (req: Request) => {
    const { requestId, logger } = createLoggingRequestContext(req, {
      route: 'clerk_billing_webhook',
    });
    const respond = (body: BodyInit | null, init?: ResponseInit) =>
      attachRequestIdHeader(new Response(body, init), requestId);

    try {
      checkIpRateLimit(req, 'webhook');
    } catch (error) {
      if (error instanceof RateLimitError) {
        logger.warn(
          { event: 'clerk_billing_webhook_rate_limited', requestId },
          'Clerk Billing webhook rate limited',
        );
        return respond('rate limited', { status: 429 });
      }
      throw error;
    }

    const eventId = req.headers.get('svix-id');
    if (!eventId) {
      logger.warn('Clerk Billing webhook missing svix-id');
      return respond('missing webhook id', { status: 400 });
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
        'Clerk Billing webhook payload too large (content-length)',
      );
      return respond('payload too large', { status: 413 });
    }

    const rawBody = await readUtf8BodyCapped(req);
    if (rawBody === null) {
      logger.warn(
        { maxBytes: WEBHOOK_MAX_BYTES },
        'Clerk Billing webhook payload too large while streaming',
      );
      return respond('payload too large', { status: 413 });
    }

    let event: WebhookEvent;
    try {
      // Body was read separately for size capping; rebuild a Request for verifyWebhook.
      const verificationRequest = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: rawBody,
      });
      // RequestLike's type omits the Web Request API; verifyWebhook accepts it at runtime.
      event = await verifyWebhook(
        verificationRequest as Parameters<typeof verifyWebhook>[0],
        {
          signingSecret: clerkAuthEnv.webhookSigningSecret,
        },
      );
    } catch (error) {
      logger.warn({ error }, 'Clerk Billing webhook verification failed');
      return respond('webhook verification failed', { status: 400 });
    }

    const result = await applyVerifiedClerkBillingEvent(event, eventId, {
      logger,
    });

    return respond(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

export const POST = createClerkBillingWebhookHandler();
