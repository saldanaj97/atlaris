import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { json, jsonError } from '@/lib/api/response';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { createCustomer } from '@/lib/stripe/subscriptions';
import { getStripe } from '@/lib/stripe/client';

interface CreateCheckoutBody {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}

// POST /api/v1/stripe/create-checkout
export const POST = withErrorBoundary(
  withAuthAndRateLimit('billing', async ({ req, userId: clerkUserId }) => {
    const stripe = getStripe();

    // Get user from database
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return jsonError('User not found', { status: 404 });
    }

    // Parse request body
    let body: CreateCheckoutBody;
    try {
      body = (await req.json()) as CreateCheckoutBody;
    } catch {
      return jsonError('Invalid JSON body', { status: 400 });
    }

    const { priceId, successUrl, cancelUrl } = body;

    if (!priceId) {
      return jsonError('priceId is required', { status: 400 });
    }

    // Get or create Stripe customer
    const customerId = await createCustomer(user.id, user.email);

    // Create checkout session
    const origin = req.headers.get('origin') ?? '';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url:
        successUrl ||
        `${origin}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/settings/billing`,
    });

    return json({ sessionUrl: session.url });
  })
);
