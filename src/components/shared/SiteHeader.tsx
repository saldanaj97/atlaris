import type { SubscriptionTier } from '@/shared/types/billing.types';

import SiteHeaderChrome from './nav/SiteHeaderChrome';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/features/navigation';
import { canCreatePlanOnCurrentTier } from '@/features/plans/policy/entitlement';
import { DeletedAuthUserError } from '@/lib/api/errors';
import { requestBoundary } from '@/lib/api/request-boundary';
import {
  getShellAuthUserId,
  isLocalProductTestingAuthEnabled,
  shouldUseClerkUi,
} from '@/lib/auth/local-identity';
import { getSessionSafe } from '@/lib/auth/server';
import { devAuthEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import { resolveViewerSiteGate } from '@/lib/proxy/middleware-policy';
import { resolveSiteGate } from '@/lib/proxy/site-gate';
import { currentUser } from '@clerk/nextjs/server';

export default async function SiteHeader({
  loadAccountProfile = true,
}: {
  loadAccountProfile?: boolean;
} = {}) {
  const [{ session }, siteGate] = await Promise.all([
    getSessionSafe(),
    resolveSiteGate(),
  ]);
  const authUserId = resolveViewerSiteGate(siteGate, Boolean(session?.user?.id))
    ? undefined
    : getShellAuthUserId(session?.user?.id);
  let showClerkUserButton = false;
  try {
    showClerkUserButton = shouldUseClerkUi();
  } catch (err) {
    logger.warn(
      {
        err,
        source: 'SiteHeader.shouldUseClerkUi',
      },
      'Clerk UI eligibility check failed; header renders account link fallback',
    );
  }
  let tier: SubscriptionTier | undefined;
  let canCreatePlan: boolean | undefined;
  let userName: string | undefined;
  let userImageUrl: string | undefined;
  let accountDeleted = false;
  if (authUserId) {
    const entitlementPromise = requestBoundary
      .component(({ actor }) => ({
        tier: actor.subscriptionTier,
        canCreatePlan: canCreatePlanOnCurrentTier(actor),
      }))
      .then((result) => {
        tier = result?.tier;
        canCreatePlan = result?.canCreatePlan;
      })
      .catch((err: unknown) => {
        if (err instanceof DeletedAuthUserError) {
          accountDeleted = true;
          return;
        }
        logger.warn(
          {
            err,
            authUserId,
            source: 'SiteHeader.subscriptionTier',
          },
          'Subscription tier fetch failed; header renders without tier badge',
        );
      });

    const profilePromise = !loadAccountProfile
      ? Promise.resolve()
      : isLocalProductTestingAuthEnabled()
        ? Promise.resolve().then(() => {
            userName = devAuthEnv.name;
          })
        : currentUser()
            .then((user) => {
              if (!user) {
                return;
              }
              const composedName = [user.firstName, user.lastName]
                .filter(Boolean)
                .join(' ');
              userName =
                (user.fullName ?? composedName) || user.username || undefined;
              userImageUrl = user.imageUrl;
            })
            .catch((err: unknown) => {
              logger.warn(
                {
                  err,
                  authUserId,
                  source: 'SiteHeader.currentUser',
                },
                'Clerk user fetch failed; account chrome falls back to initials',
              );
            });

    await Promise.all([entitlementPromise, profilePromise]);
  }

  const isAuthenticated = Boolean(authUserId) && !accountDeleted;
  const navItems = isAuthenticated
    ? authenticatedNavItems
    : unauthenticatedNavItems;

  return (
    <header className='fixed top-0 left-0 z-50 w-full pt-[env(safe-area-inset-top,0px)] pr-[env(safe-area-inset-right,0px)] pl-[env(safe-area-inset-left,0px)]'>
      <SiteHeaderChrome
        navItems={navItems}
        tier={tier}
        canCreatePlan={canCreatePlan}
        isAuthenticated={isAuthenticated}
        showClerkUserButton={showClerkUserButton}
        userName={userName}
        userImageUrl={userImageUrl}
      />
    </header>
  );
}
