import { Paper } from '@/components/shared/Paper';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/lib/navigation';

import DesktopHeader from './nav/DesktopHeader';
import MobileHeader from './nav/MobileHeader';

/**
 * Server component wrapper for the site header.
 *
 * Responsibilities:
 * - Resolve whether a user is signed in (server-side)
 * - Select appropriate nav items based on auth state
 * - Render MobileHeader (mobile/tablet) and DesktopHeader (desktop)
 */
export default async function SiteHeader() {
  const clerkUserId = await getEffectiveClerkUserId();
  const isSignedIn = Boolean(clerkUserId);
  const navItems = isSignedIn ? authenticatedNavItems : unauthenticatedNavItems;

  return (
    <header className="container mx-auto my-4 w-full">
      <Paper className="flex items-center justify-between gap-4 p-4">
        <MobileHeader navItems={navItems} />
        <DesktopHeader navItems={navItems} />
      </Paper>
    </header>
  );
}
