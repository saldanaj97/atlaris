import type { PlainHandler } from './auth';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { jsonError } from './response';
import {
  checkExportLimit,
  checkPlanLimit,
  checkRegenerationLimit,
} from '@/lib/stripe/usage';

/**
 * Subscription tier hierarchy
 */
const TIER_HIERARCHY = {
  free: 0,
  starter: 1,
  pro: 2,
} as const;

type SubscriptionTier = keyof typeof TIER_HIERARCHY;

/**
 * Middleware to require a minimum subscription tier
 * @param minTier Minimum subscription tier required
 */
export function requireSubscription(minTier: SubscriptionTier) {
  return (handler: PlainHandler): PlainHandler => {
    return async (req: Request) => {
      // Get user from request context (assumes withAuth middleware is applied)
      const { getRequestContext } = await import('./context');
      const { getEffectiveClerkUserId } = await import('./auth');
      const context = getRequestContext();
      let clerkUserId: string | undefined = context?.userId;

      // Fallback to effective Clerk user id in tests or when middleware wasn't applied
      if (!clerkUserId) {
        const maybeId = await getEffectiveClerkUserId();
        clerkUserId = maybeId ?? undefined;
      }

      if (!clerkUserId) {
        return jsonError('Unauthorized', { status: 401 });
      }

      // Get user subscription tier
      const user = await getUserByClerkId(clerkUserId);
      if (!user) {
        return jsonError('User not found', { status: 404 });
      }

      const userTierLevel = TIER_HIERARCHY[user.subscriptionTier];
      const requiredTierLevel = TIER_HIERARCHY[minTier];

      if (userTierLevel < requiredTierLevel) {
        return jsonError(
          `This feature requires a ${minTier} subscription or higher`,
          {
            status: 403,
            code: 'INSUFFICIENT_SUBSCRIPTION_TIER',
            details: {
              currentTier: user.subscriptionTier,
              requiredTier: minTier,
            },
          }
        );
      }

      // Proceed with the handler
      return handler(req);
    };
  };
}

/**
 * Feature types that can be limited
 */
export type FeatureType = 'plan' | 'regeneration' | 'export';

/**
 * Middleware to check feature usage limits
 * @param feature Feature type to check
 */
export function checkFeatureLimit(feature: FeatureType) {
  return (handler: PlainHandler): PlainHandler => {
    return async (req: Request) => {
      // Get user from request context
      const { getRequestContext } = await import('./context');
      const { getEffectiveClerkUserId } = await import('./auth');
      const context = getRequestContext();
      let clerkUserId: string | undefined = context?.userId;

      // Fallback to effective Clerk user id in tests or when middleware wasn't applied
      if (!clerkUserId) {
        const maybeId = await getEffectiveClerkUserId();
        clerkUserId = maybeId ?? undefined;
      }

      if (!clerkUserId) {
        return jsonError('Unauthorized', { status: 401 });
      }

      // Get user database ID
      const user = await getUserByClerkId(clerkUserId);
      if (!user) {
        return jsonError('User not found', { status: 404 });
      }

      // Check limits based on feature type
      let hasLimit = false;
      let limitMessage = '';

      switch (feature) {
        case 'plan': {
          hasLimit = await checkPlanLimit(user.id);
          limitMessage =
            'You have reached the maximum number of active plans for your subscription tier';
          break;
        }
        case 'regeneration': {
          hasLimit = await checkRegenerationLimit(user.id);
          limitMessage =
            'You have reached your monthly regeneration limit for your subscription tier';
          break;
        }
        case 'export': {
          hasLimit = await checkExportLimit(user.id);
          limitMessage =
            'You have reached your monthly export limit for your subscription tier';
          break;
        }
      }

      if (!hasLimit) {
        return jsonError(limitMessage, {
          status: 403,
          code: 'FEATURE_LIMIT_EXCEEDED',
          details: {
            feature,
            tier: user.subscriptionTier,
          },
        });
      }

      // Proceed with the handler
      return handler(req);
    };
  };
}

/**
 * Helper to check if user has a specific subscription tier or higher
 */
export async function hasSubscriptionTier(
  clerkUserId: string,
  minTier: SubscriptionTier
): Promise<boolean> {
  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    return false;
  }

  const userTierLevel = TIER_HIERARCHY[user.subscriptionTier];
  const requiredTierLevel = TIER_HIERARCHY[minTier];

  return userTierLevel >= requiredTierLevel;
}

/**
 * Helper to check if user can use a specific feature
 */
export async function canUseFeature(
  userId: string,
  feature: FeatureType
): Promise<boolean> {
  switch (feature) {
    case 'plan':
      return checkPlanLimit(userId);
    case 'regeneration':
      return checkRegenerationLimit(userId);
    case 'export':
      return checkExportLimit(userId);
    default:
      return false;
  }
}
