'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import DesktopHeader from './DesktopHeader';
import { getHeaderShellVariant } from './header-shell';
import MobileHeader from './MobileHeader';
import { usePathname } from 'next/navigation';

interface SiteHeaderChromeProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  userName?: string;
  userImageUrl?: string | null;
}

/**
 * Single client boundary for pathname-driven header chrome.
 * Avoids duplicate `usePathname()` in mobile/desktop headers and navigation.
 */
export default function SiteHeaderChrome({
  navItems,
  tier,
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
}: SiteHeaderChromeProps) {
  const pathname = usePathname();
  const headerVariant = getHeaderShellVariant(pathname);

  return (
    <>
      <MobileHeader
        headerVariant={headerVariant}
        pathname={pathname}
        navItems={navItems}
        tier={tier}
        isAuthenticated={isAuthenticated}
        showClerkUserButton={showClerkUserButton}
        userName={userName}
        userImageUrl={userImageUrl}
      />
      <DesktopHeader
        headerVariant={headerVariant}
        pathname={pathname}
        navItems={navItems}
        tier={tier}
        isAuthenticated={isAuthenticated}
        showClerkUserButton={showClerkUserButton}
        userName={userName}
        userImageUrl={userImageUrl}
      />
    </>
  );
}
