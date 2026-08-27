'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';

import DesktopHeader from './DesktopHeader';
import MobileHeader from './MobileHeader';
import { normalizeNavPathname } from './nav-active';
import {
  APP_SHELL_COLUMN,
  APP_SHELL_GUTTER,
} from '@/components/layout/app-shell-width';
import {
  type NavItem,
  ROUTES,
  unauthenticatedNavItems,
} from '@/features/navigation';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';

interface SiteHeaderChromeProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
  canCreatePlan?: boolean;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  userName?: string;
  userImageUrl?: string | null;
}

/**
 * Single client boundary for pathname-driven header chrome.
 * Owns the flat full-bleed backdrop, content column, and fading bottom hairline.
 *
 * Marketing routes always resolve to marketing nav items, regardless of auth.
 */
export default function SiteHeaderChrome({
  navItems,
  tier,
  canCreatePlan,
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
}: SiteHeaderChromeProps) {
  const pathname = normalizeNavPathname(usePathname());
  const isMarketing =
    pathname === ROUTES.HOME ||
    pathname === ROUTES.LANDING ||
    pathname === ROUTES.PRICING;
  const resolvedNavItems = isMarketing ? unauthenticatedNavItems : navItems;
  return (
    <>
      <div aria-hidden='true' className='absolute inset-0 z-0 bg-background' />

      <div className={cn('relative z-10', APP_SHELL_GUTTER)}>
        <div className={cn(APP_SHELL_COLUMN, 'relative')}>
          <MobileHeader
            isMarketing={isMarketing}
            pathname={pathname}
            navItems={resolvedNavItems}
            tier={tier}
            canCreatePlan={canCreatePlan}
            isAuthenticated={isAuthenticated}
            showClerkUserButton={showClerkUserButton}
            userName={userName}
            userImageUrl={userImageUrl}
          />
          <DesktopHeader
            isMarketing={isMarketing}
            pathname={pathname}
            navItems={resolvedNavItems}
            tier={tier}
            canCreatePlan={canCreatePlan}
            isAuthenticated={isAuthenticated}
            showClerkUserButton={showClerkUserButton}
            userName={userName}
            userImageUrl={userImageUrl}
          />
          {/* Editorial hairline: fades at both ends instead of a hard border. */}
          <div
            aria-hidden='true'
            className='absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-border to-transparent'
          />
        </div>
      </div>
    </>
  );
}
