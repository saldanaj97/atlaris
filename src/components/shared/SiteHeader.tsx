import { withServerComponentContext } from '@/lib/api/auth';
import { getSessionSafe } from '@/lib/auth/server';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/lib/navigation';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import DesktopHeader from './nav/DesktopHeader';
import MobileHeader from './nav/MobileHeader';

/**
 * Server component wrapper for the site header.
 *
 * **Responsibilities:**
 * - Resolve whether a user is signed in (server-side)
 * - Select appropriate nav items based on auth state
 * - Fetch user's subscription tier for display
 * - Render MobileHeader (mobile/tablet) and DesktopHeader (desktop)
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
 *   position brand, navigation, and auth controls. Handle responsive visibility.
 *
 * - **Navigation components** (DesktopNavigation, MobileNavigation): Render the
 *   actual nav links with their specific interaction patterns (dropdowns vs sheets).
 *
 */
export default async function SiteHeader() {
  const { session } = await getSessionSafe();
  const authUserId = session?.user?.id;
  const navItems = authUserId ? authenticatedNavItems : unauthenticatedNavItems;

  // Fetch tier only for authenticated users
  let tier: SubscriptionTier | undefined;
  if (authUserId) {
    try {
      const result = await withServerComponentContext(
        async (user) => user.subscriptionTier
      );
      tier = result ?? undefined;
    } catch {
      // Silently fail - tier badge is non-critical
    }
  }

  return (
    <header className="fixed top-0 left-0 z-50 w-full px-4 pt-3 lg:px-6 lg:pt-4">
      <div className="mx-auto max-w-7xl">
        <MobileHeader
          navItems={navItems}
          tier={tier}
          isAuthenticated={Boolean(authUserId)}
        />
        <DesktopHeader
          navItems={navItems}
          tier={tier}
          isAuthenticated={Boolean(authUserId)}
        />
      </div>
    </header>
  );
}
