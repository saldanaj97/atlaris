import { Webhook } from 'svix';

import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { clerkWebhookEnv } from '@/lib/config/env';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClerkUserDeletedEvent {
  type: 'user.deleted';
  data: {
    id: string;
    deleted: boolean;
  };
}

type ClerkWebhookEvent = ClerkUserDeletedEvent;

export async function POST(req: Request): Promise<Response> {
  const { requestId, logger } = createRequestContext(req, {
    route: 'clerk_webhook',
  });
  const respond = (body: BodyInit | null, init?: ResponseInit) =>
    attachRequestIdHeader(new Response(body, init), requestId);

  try {
    checkIpRateLimit(req, 'webhook');
  } catch (error) {
    logger.warn({ error }, 'Clerk webhook rate limited');
    return respond('rate limited', { status: 429 });
  }

  const rawBody = await req.text();

  // Basic body size guard (avoid excessive payloads)
  const MAX_BYTES = 256 * 1024; // 256KB
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BYTES) {
    logger.warn(
      { size: Buffer.byteLength(rawBody, 'utf8') },
      'Clerk webhook payload too large'
    );
    return respond('payload too large', { status: 413 });
  }

  // Verify webhook signature
  const webhookSecret = clerkWebhookEnv.secret;
  if (!webhookSecret) {
    logger.error('Clerk webhook secret not configured');
    return respond('webhook misconfigured', { status: 500 });
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.warn('Clerk webhook missing required Svix headers');
    return respond('missing signature headers', { status: 400 });
  }

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch (error) {
    logger.error({ error }, 'Clerk webhook signature verification failed');
    return respond('signature verification failed', { status: 400 });
  }

  // Import DB and schema for idempotency check
  const { db } = await import('@/lib/db/service-role');
  const { clerkWebhookEvents } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Idempotency check - prevent duplicate processing
  const alreadyProcessed = await db
    .select({ eventId: clerkWebhookEvents.eventId })
    .from(clerkWebhookEvents)
    .where(eq(clerkWebhookEvents.eventId, svixId))
    .limit(1);

  if (alreadyProcessed.length > 0) {
    logger.info(
      { type: event.type, eventId: svixId },
      'Duplicate Clerk webhook event skipped'
    );
    return respond('ok');
  }

  // Handle events
  switch (event.type) {
    case 'user.deleted': {
      const clerkUserId = event.data.id;
      logger.info({ clerkUserId }, 'Processing user.deleted webhook');

      const { deleteUserByClerkId } = await import('@/lib/db/queries/users');
      const result = await deleteUserByClerkId(clerkUserId);

      if (result.deleted) {
        logger.info(
          { clerkUserId, userId: result.userId },
          'User deleted successfully via Clerk webhook'
        );
      } else {
        // User might not exist in our DB (e.g., never completed signup)
        logger.info(
          { clerkUserId },
          'User not found in database during deletion webhook'
        );
      }
      break;
    }

    default: {
      // Log unhandled events for monitoring but don't fail
      const unhandledEvent = event as { type: string };
      logger.warn(
        { type: unhandledEvent.type },
        'Unhandled Clerk webhook event'
      );
      break;
    }
  }

  // Record processed event for idempotency
  await db
    .insert(clerkWebhookEvents)
    .values({
      eventId: svixId,
      type: event.type,
    })
    .onConflictDoNothing({ target: clerkWebhookEvents.eventId });

  return respond('ok');
}
