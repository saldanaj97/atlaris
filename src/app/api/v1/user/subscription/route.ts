import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { json, jsonError } from '@/lib/api/response';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { getUsageSummary } from '@/lib/stripe/usage';

// GET /api/v1/user/subscription
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ userId: clerkUserId }) => {
    // Get user from database
    const user = await getUserByClerkId(clerkUserId);
    if (!user) {
      return jsonError('User not found', { status: 404 });
    }

    // Get usage summary
    const db = getDb();
    const usage = await getUsageSummary(user.id, db);

    // Build response
    const response = {
      tier: user.subscriptionTier,
      status: user.subscriptionStatus,
      periodEnd: user.subscriptionPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: false, // Will be determined from Stripe API if needed
      usage: {
        activePlans: usage.activePlans,
        regenerations: usage.regenerations,
        exports: usage.exports,
      },
    };

    return json(response);
  })
);
