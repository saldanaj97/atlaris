'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';

import AppSidebar from './AppSidebar';
import {
  DESKTOP_SIDEBAR_COLLAPSE_CONTROL_ID,
  DESKTOP_SIDEBAR_EXPAND_CONTROL_ID,
  DESKTOP_SIDEBAR_ID,
  useDesktopSidebarOpen,
} from './desktop-sidebar-state';
import DesktopHeader from './DesktopHeader';
import MobileHeader from './MobileHeader';
import { normalizeNavPathname } from './nav-active';
import {
  APP_SHELL_COLUMN,
  APP_SHELL_GUTTER,
  APP_SHELL_SIDEBAR_OFFSET,
} from '@/components/layout/app-shell-width';
import {
  type NavItem,
  ROUTES,
  unauthenticatedNavItems,
} from '@/features/navigation';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';

interface SiteHeaderChromeProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
  canCreatePlan?: boolean;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  userName?: string;
  userImageUrl?: string | null;
}

function isSupportedAppPath(pathname: string): boolean {
  return [
    ROUTES.DASHBOARD,
    ROUTES.PLANS.ROOT,
    ROUTES.ANALYTICS.ROOT,
    ROUTES.SETTINGS.ROOT,
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Single client boundary for pathname-driven header chrome.
 * Owns the flat full-bleed backdrop and content column.
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
    pathname === ROUTES.PRICING ||
    pathname === ROUTES.ABOUT;
  const isAppShell = isAuthenticated && isSupportedAppPath(pathname);
  const resolvedNavItems = isMarketing ? unauthenticatedNavItems : navItems;
  const { open: desktopSidebarOpen, setOpen: setDesktopSidebarOpen } =
    useDesktopSidebarOpen(isAppShell);
  const pendingToggleFocusRef = useRef(false);

  const setSidebarOpen = (next: boolean) => {
    pendingToggleFocusRef.current = true;
    setDesktopSidebarOpen(next);
  };

  useLayoutEffect(() => {
    if (!pendingToggleFocusRef.current) {
      return;
    }
    pendingToggleFocusRef.current = false;
    const controlId = desktopSidebarOpen
      ? DESKTOP_SIDEBAR_COLLAPSE_CONTROL_ID
      : DESKTOP_SIDEBAR_EXPAND_CONTROL_ID;
    document.getElementById(controlId)?.focus();
  }, [desktopSidebarOpen]);

  return (
    <>
      <div aria-hidden='true' className='absolute inset-0 z-0 bg-background' />

      {isAppShell && desktopSidebarOpen ? (
        <AppSidebar
          id={DESKTOP_SIDEBAR_ID}
          className='fixed inset-y-0 left-0 z-40 hidden w-[var(--at-semantic-layout-sidebar,14rem)] border-r border-sidebar-border lg:flex'
          pathname={pathname}
          navItems={resolvedNavItems}
          tier={tier}
          userName={userName}
          userImageUrl={userImageUrl}
          onDesktopCollapse={() => setSidebarOpen(false)}
        />
      ) : null}

      <div
        className={cn('relative z-10', isAppShell && APP_SHELL_SIDEBAR_OFFSET)}
      >
        <div className={APP_SHELL_GUTTER}>
          <div className={cn(APP_SHELL_COLUMN, 'relative')}>
            <MobileHeader
              isMarketing={isMarketing}
              isAppShell={isAppShell}
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
              isAppShell={isAppShell}
              pathname={pathname}
              navItems={resolvedNavItems}
              tier={tier}
              canCreatePlan={canCreatePlan}
              isAuthenticated={isAuthenticated}
              showClerkUserButton={showClerkUserButton}
              userName={userName}
              userImageUrl={userImageUrl}
              sidebarOpen={desktopSidebarOpen}
              onSidebarOpenChange={setSidebarOpen}
            />
          </div>
        </div>
      </div>
    </>
  );
}
