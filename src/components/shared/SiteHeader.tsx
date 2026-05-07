import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/features/navigation';
import { requestBoundary } from '@/lib/api/request-boundary';
import {
  getShellAuthUserId,
  shouldUseClerkUi,
} from '@/lib/auth/local-identity';
import { getSessionSafe } from '@/lib/auth/server';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import DesktopHeader from './nav/DesktopHeader';
import MobileHeader from './nav/MobileHeader';

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
  }

  return (
    <header className="fixed top-0 left-0 z-50 w-full px-4 pt-3 lg:px-6 lg:pt-4">
      <div className="mx-auto max-w-7xl">
        <MobileHeader
          navItems={navItems}
          tier={tier}
          isAuthenticated={Boolean(authUserId)}
          showClerkUserButton={showClerkUserButton}
        />
        <DesktopHeader
          navItems={navItems}
          tier={tier}
          isAuthenticated={Boolean(authUserId)}
          showClerkUserButton={showClerkUserButton}
        />
      </div>
    </header>
  );
}
