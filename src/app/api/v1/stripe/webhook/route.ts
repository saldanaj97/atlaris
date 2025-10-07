import { withErrorBoundary } from '@/lib/api/auth';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorBoundary(async (req: Request) => {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // If not configured yet, accept payloads to unblock local dev
  if (!webhookSecret) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      const type =
        parsed && typeof parsed === 'object' && 'type' in parsed
          ? (parsed as { type?: string }).type
          : undefined;
      switch (type) {
        case 'checkout.session.completed':
        case 'invoice.payment_succeeded':
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
        default:
          break;
      }
      return new Response('ok');
    } catch {
      return new Response('bad request', { status: 400 });
    }
  }

  if (!signature) {
    return new Response('missing signature', { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return new Response('signature verification failed', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'invoice.payment_succeeded':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    default:
      break;
  }

  return new Response('ok');
});
