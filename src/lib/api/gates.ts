import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import {
  checkExportLimit,
  checkPlanLimit,
  checkRegenerationLimit,
} from '@/lib/stripe/usage';
import type { PlainHandler } from './auth';
import { jsonError } from './response';

/**
 * Subscription tier hierarchy
 */
const TIER_HIERARCHY = {
  free: 0,
  starter: 1,
  pro: 2,
} as const;

type SubscriptionTier = keyof typeof TIER_HIERARCHY;

type GateUser = NonNullable<Awaited<ReturnType<typeof getUserByAuthId>>>;

type GateUserResolutionResult =
  | { ok: true; user: GateUser }
  | { ok: false; response: Response };

async function resolveGateUser(): Promise<GateUserResolutionResult> {
  const { getRequestContext } = await import('./context');
  const { getEffectiveAuthUserId } = await import('./auth');
  const context = getRequestContext();
  let authUserId: string | undefined = context?.userId;

  // Fallback to effective auth user id in tests or when middleware wasn't applied
  if (!authUserId) {
    const maybeId = await getEffectiveAuthUserId();
    authUserId = maybeId ?? undefined;
  }

  if (!authUserId) {
    return {
      ok: false,
      response: jsonError('Unauthorized', { status: 401 }),
    };
  }

  const user = await getUserByAuthId(authUserId);
  if (!user) {
    return {
      ok: false,
      response: jsonError('User not found', { status: 404 }),
    };
  }

  return { ok: true, user };
}

/**
 * Middleware to require a minimum subscription tier
 * @param minTier Minimum subscription tier required
 */
export function requireSubscription(minTier: SubscriptionTier) {
  return (handler: PlainHandler): PlainHandler => {
    return async (req: Request) => {
      const resolved = await resolveGateUser();
      if (!resolved.ok) {
        return resolved.response;
      }
      const { user } = resolved;

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
      const resolved = await resolveGateUser();
      if (!resolved.ok) {
        return resolved.response;
      }
      const { user } = resolved;

      // Check limits based on feature type
      const db = getDb();
      let hasLimit = false;
      let limitMessage = '';

      switch (feature) {
        case 'plan': {
          hasLimit = await checkPlanLimit(user.id, db);
          limitMessage =
            'You have reached the maximum number of active plans for your subscription tier';
          break;
        }
        case 'regeneration': {
          hasLimit = await checkRegenerationLimit(user.id, db);
          limitMessage =
            'You have reached your monthly regeneration limit for your subscription tier';
          break;
        }
        case 'export': {
          hasLimit = await checkExportLimit(user.id, db);
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
  authUserId: string,
  minTier: SubscriptionTier
): Promise<boolean> {
  const user = await getUserByAuthId(authUserId);
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
  const db = getDb();
  switch (feature) {
    case 'plan':
      return checkPlanLimit(userId, db);
    case 'regeneration':
      return checkRegenerationLimit(userId, db);
    case 'export':
      return checkExportLimit(userId, db);
    default:
      return false;
  }
}
