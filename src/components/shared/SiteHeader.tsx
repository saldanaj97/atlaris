import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/lib/navigation';
import { auth } from '@clerk/nextjs/server';
import DesktopHeader from './nav/DesktopHeader';
import MobileHeader from './nav/MobileHeader';

/**
 * Server component wrapper for the site header.
 *
 * **Responsibilities:**
 * - Resolve whether a user is signed in (server-side)
 * - Select appropriate nav items based on auth state
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
  const { userId } = await auth();
  const navItems = userId ? authenticatedNavItems : unauthenticatedNavItems;

  return (
    <header className="fixed top-0 left-0 z-50 w-full px-4 pt-4 lg:px-6 lg:pt-5">
      <div className="mx-auto max-w-7xl">
        <MobileHeader navItems={navItems} />
        <DesktopHeader navItems={navItems} />
      </div>
    </header>
  );
}
