import { getUserByAuthId } from '@/lib/db/queries/users';
import type { getDb } from '@/lib/db/runtime';
import { AppError, AuthError, NotFoundError } from '@/lib/api/errors';
import {
  checkExportLimit,
  checkPlanLimit,
  checkRegenerationLimit,
} from '@/lib/stripe/usage';
import type { PlainHandler, RouteHandlerContext } from '@/lib/api/auth';
import { getEffectiveAuthUserId } from '@/lib/api/auth';
import { getRequestContext } from '@/lib/api/context';

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

/**
 * Resolves the authenticated user for gate checks.
 * MUST be called inside a `withAuth` context (or equivalent) where
 * the request context has a DB client set up via `createRequestContext`.
 * Falls back to `getEffectiveAuthUserId()` for tests or edge cases
 * where middleware wasn't applied, but still assumes `getDb()` will
 * succeed for the subsequent user lookup.
 */
async function resolveGateUser(): Promise<GateUser> {
  const context = getRequestContext();
  let authUserId: string | undefined = context?.userId;

  // Fallback to effective auth user id in tests or when middleware wasn't applied
  if (!authUserId) {
    const maybeId = await getEffectiveAuthUserId();
    authUserId = maybeId ?? undefined;
  }

  if (!authUserId) {
    throw new AuthError();
  }

  const user = await getUserByAuthId(authUserId, context?.db);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}

/**
 * Middleware to require a minimum subscription tier.
 * NOTE: Defined but not yet wired into any route handlers.
 * @param minTier Minimum subscription tier required
 */
export function requireSubscription(minTier: SubscriptionTier) {
  return (handler: PlainHandler): PlainHandler => {
    return async (req: Request, routeContext?: RouteHandlerContext) => {
      const user = await resolveGateUser();

      const userTierLevel = TIER_HIERARCHY[user.subscriptionTier];
      const requiredTierLevel = TIER_HIERARCHY[minTier];

      if (userTierLevel < requiredTierLevel) {
        throw new AppError(
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

      return handler(req, routeContext);
    };
  };
}

/**
 * Feature types that can be limited
 */
export type FeatureType = 'plan' | 'regeneration' | 'export';

export type GateDbClient = ReturnType<typeof getDb>;

export type GateDbClientResolver = () => GateDbClient;

/**
 * Middleware to check feature usage limits.
 * NOTE: Defined but not yet wired into any route handlers.
 * @param feature Feature type to check
 * @param getDbClient Resolves the request-scoped DB client
 */
export function checkFeatureLimit(
  feature: FeatureType,
  getDbClient: GateDbClientResolver
): (handler: PlainHandler) => PlainHandler {
  return (handler: PlainHandler): PlainHandler => {
    return async (req: Request, routeContext?: RouteHandlerContext) => {
      const user = await resolveGateUser();

      // Check limits based on feature type
      const db = getDbClient();
      let withinLimit = false;
      let limitMessage = '';

      switch (feature) {
        case 'plan': {
          withinLimit = await checkPlanLimit(user.id, db);
          limitMessage =
            'You have reached the maximum number of active plans for your subscription tier';
          break;
        }
        case 'regeneration': {
          withinLimit = await checkRegenerationLimit(user.id, db);
          limitMessage =
            'You have reached your monthly regeneration limit for your subscription tier';
          break;
        }
        case 'export': {
          withinLimit = await checkExportLimit(user.id, db);
          limitMessage =
            'You have reached your monthly export limit for your subscription tier';
          break;
        }
      }

      if (!withinLimit) {
        throw new AppError(limitMessage, {
          status: 403,
          code: 'FEATURE_LIMIT_EXCEEDED',
          classification: 'rate_limit',
          details: {
            feature,
            tier: user.subscriptionTier,
          },
        });
      }

      return handler(req, routeContext);
    };
  };
}

/**
 * Helper to check if user has a specific subscription tier or higher.
 * @param authUserId - The external auth provider user ID
 * @param minTier - Minimum subscription tier required
 * @param dbClient - Optional RLS-enforced client; defaults to getDb() via request context
 */
export async function hasSubscriptionTier(
  authUserId: string,
  minTier: SubscriptionTier,
  dbClient?: GateDbClient
): Promise<boolean> {
  const user = await getUserByAuthId(authUserId, dbClient);
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
  feature: FeatureType,
  dbClient: GateDbClient
): Promise<boolean> {
  switch (feature) {
    case 'plan':
      return checkPlanLimit(userId, dbClient);
    case 'regeneration':
      return checkRegenerationLimit(userId, dbClient);
    case 'export':
      return checkExportLimit(userId, dbClient);
    default:
      return false;
  }
}
