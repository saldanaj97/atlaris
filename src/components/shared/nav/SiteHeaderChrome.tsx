'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import DesktopHeader from './DesktopHeader';
import MobileHeader from './MobileHeader';
import { usePathname } from 'next/navigation';

interface SiteHeaderChromeProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
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
}: SiteHeaderChromeProps) {
  const pathname = usePathname();

  return (
    <>
      <MobileHeader
        pathname={pathname}
        navItems={navItems}
        tier={tier}
        isAuthenticated={isAuthenticated}
        showClerkUserButton={showClerkUserButton}
      />
      <DesktopHeader
        pathname={pathname}
        navItems={navItems}
        tier={tier}
        isAuthenticated={isAuthenticated}
        showClerkUserButton={showClerkUserButton}
      />
    </>
  );
}
