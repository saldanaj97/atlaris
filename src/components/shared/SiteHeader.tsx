import type { SubscriptionTier } from '@/shared/types/billing.types';

import SiteHeaderChrome from './nav/SiteHeaderChrome';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/features/navigation';
import { requestBoundary } from '@/lib/api/request-boundary';
import {
  getShellAuthUserId,
  isLocalProductTestingAuthEnabled,
  shouldUseClerkUi,
} from '@/lib/auth/local-identity';
import { getSessionSafe } from '@/lib/auth/server';
import { devAuthEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import { currentUser } from '@clerk/nextjs/server';

/**
 * Server component wrapper for the site header.
 *
 * **Responsibilities:**
 * - Resolve whether a user is signed in (server-side)
 * - Select appropriate nav items based on auth state
 * - Fetch user's subscription tier for display
 * - Render MobileHeader (viewports below `md`) and DesktopHeader (`md` and up)
 *
 *
 * **Architecture:**
 *
 * Header -> Navigation separation
 *
 * We maintain separate Header and Navigation components because they serve
 * distinct purposes:
 *
 * - **Header components** (DesktopHeader, MobileHeader): Layout containers that
 *   position brand, navigation, and auth controls. Handle responsive visibility (`md` breakpoint).
 *
 * - **Navigation components** (DesktopNavigation, MobileNavigation): Render the
 *   actual nav links with their specific interaction patterns (dropdowns vs sheets).
 *
 */
export default async function SiteHeader() {
  const { session } = await getSessionSafe();
  const authUserId = getShellAuthUserId(session?.user?.id);
  let showClerkUserButton = false;
  try {
    // Local product-testing auth has no Clerk session, so it uses the account link fallback.
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
  const navItems = authUserId ? authenticatedNavItems : unauthenticatedNavItems;

  // Fetch tier only for authenticated users
  let tier: SubscriptionTier | undefined;
  let userName: string | undefined;
  let userImageUrl: string | undefined;
  if (authUserId) {
    try {
      const result = await requestBoundary.component(
        ({ actor }) => actor.subscriptionTier,
      );
      tier = result ?? undefined;
    } catch (err) {
      // Non-critical for shell render: tier badge omitted; log for ops visibility.
      logger.warn(
        {
          err,
          authUserId,
          source: 'SiteHeader.subscriptionTier',
        },
        'Subscription tier fetch failed; header renders without tier badge',
      );
    }

    // Avatar fallback only — Clerk UserButton owns production avatars.
    if (!showClerkUserButton) {
      if (isLocalProductTestingAuthEnabled()) {
        userName = devAuthEnv.name;
      } else {
        try {
          const user = await currentUser();
          if (user) {
            const composedName = [user.firstName, user.lastName]
              .filter(Boolean)
              .join(' ');
            userName =
              (user.fullName ?? composedName) || user.username || undefined;
            userImageUrl = user.imageUrl;
          }
        } catch (err) {
          logger.warn(
            {
              err,
              authUserId,
              source: 'SiteHeader.currentUser',
            },
            'Clerk user fetch failed; header avatar falls back to initials',
          );
        }
      }
    }
  }

  return (
    <header className='fixed top-0 left-0 z-50 w-full'>
      <SiteHeaderChrome
        navItems={navItems}
        tier={tier}
        isAuthenticated={Boolean(authUserId)}
        showClerkUserButton={showClerkUserButton}
        userName={userName}
        userImageUrl={userImageUrl}
      />
    </header>
  );
}
