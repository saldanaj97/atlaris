import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { json, jsonError } from '@/lib/api/response';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getCustomerPortalUrl } from '@/lib/stripe/subscriptions';

interface CreatePortalBody {
  returnUrl?: string;
}

// POST /api/v1/stripe/create-portal
export const POST = withErrorBoundary(
  withAuthAndRateLimit('billing', async ({ req, userId: authUserId }) => {
    // Get user from database
    const user = await getUserByAuthId(authUserId);
    if (!user) {
      return jsonError('User not found', { status: 404 });
    }

    // User must have a Stripe customer ID
    if (!user.stripeCustomerId) {
      return jsonError('No Stripe customer found for user', { status: 400 });
    }

    // Parse request body
    let body: CreatePortalBody = {};
    try {
      body = (await req.json()) as CreatePortalBody;
    } catch {
      // Body is optional, so we can continue with defaults
    }

    const returnUrl =
      body.returnUrl || `${req.headers.get('origin')}/settings/billing`;

    // Create portal session
    const portalUrl = await getCustomerPortalUrl(
      user.stripeCustomerId,
      returnUrl
    );

    return json({ portalUrl });
  })
);
