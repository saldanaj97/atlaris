'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import {
  DESKTOP_SIDEBAR_EXPAND_CONTROL_ID,
  DESKTOP_SIDEBAR_EXPAND_LABEL,
  DESKTOP_SIDEBAR_ID,
} from '@/components/shared/nav/desktop-sidebar-state';
import DesktopNavigation from '@/components/shared/nav/DesktopNavigation';
import { marketingHeaderPrimaryCtaClassName } from '@/components/shared/nav/marketing-header-classes';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { resolveCreatePlanCta, ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { ArrowRight, PanelLeft, Plus } from 'lucide-react';
import Link from 'next/link';

interface DesktopHeaderProps {
  isMarketing: boolean;
  /** App-shell routes render navigation in the sidebar. */
  isAppShell?: boolean;
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  canCreatePlan?: boolean;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  userName?: string;
  userImageUrl?: string | null;
  sidebarOpen?: boolean;
  onSidebarOpenChange?: (open: boolean) => void;
}

/**
 * Desktop header (visible from `md` up). Below `md`, {@link MobileHeader} renders.
 *
 * App layout: brand (left) | navigation (center) | auth controls (right)
 * Marketing layout: brand (left) | navigation (center) | sign-in + theme + inverse CTA (right)
 */
export default function DesktopHeader({
  isMarketing,
  isAppShell = false,
  pathname,
  navItems,
  tier,
  canCreatePlan,
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
  sidebarOpen = true,
  onSidebarOpenChange,
}: DesktopHeaderProps) {
  const showAppShellChrome = isAppShell && !isMarketing;
  const appShellCollapsed = showAppShellChrome && sidebarOpen === false;
  const showHeaderAccountChrome = !showAppShellChrome || appShellCollapsed;
  const showMarketingChrome = isMarketing && !showAppShellChrome;
  const primaryCtaHref = isAuthenticated
    ? ROUTES.DASHBOARD
    : ROUTES.AUTH.SIGN_IN;
  const primaryCtaLabel = isAuthenticated ? 'Dashboard' : 'Begin tonight';
  const createPlanCta = resolveCreatePlanCta({
    isAuthenticated,
    canCreatePlan,
    createLabel: 'New Plan',
  });

  return (
    <div
      className={cn(
        'relative hidden h-[64px] w-full items-center',
        isAppShell ? 'lg:grid' : 'md:grid',
        showAppShellChrome
          ? appShellCollapsed
            ? 'grid-cols-[auto_minmax(0,1fr)]'
            : 'grid-cols-[minmax(0,1fr)_auto]'
          : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
      )}
    >
      {appShellCollapsed ? (
        <div className='relative z-10 flex items-center justify-self-start'>
          <Button
            id={DESKTOP_SIDEBAR_EXPAND_CONTROL_ID}
            type='button'
            variant='ghost'
            size='icon'
            aria-controls={DESKTOP_SIDEBAR_ID}
            aria-expanded={false}
            aria-label={DESKTOP_SIDEBAR_EXPAND_LABEL}
            onClick={() => onSidebarOpenChange?.(true)}
          >
            <PanelLeft aria-hidden='true' className='size-5' />
          </Button>
        </div>
      ) : !showAppShellChrome ? (
        <div className='relative z-10 flex min-w-0 items-center justify-self-start'>
          <BrandLogo />
        </div>
      ) : null}

      {!showAppShellChrome ? (
        <div className='relative z-10 flex justify-self-center'>
          <DesktopNavigation
            pathname={pathname}
            navItems={navItems}
            appearance={showMarketingChrome ? 'marketing' : 'default'}
          />
        </div>
      ) : null}

      {/* Auth / CTA controls (right) */}
      <div
        className={cn(
          'relative z-10 flex min-w-0 items-center justify-end gap-2 justify-self-end',
          showAppShellChrome && !appShellCollapsed && 'col-start-2',
        )}
      >
        {isMarketing ? (
          <>
            {!isAuthenticated ? (
              <Button
                asChild
                variant='ghost'
                size='sm'
                className='text-sm text-muted-foreground hover:text-foreground'
              >
                <Link href={ROUTES.AUTH.SIGN_IN}>Sign in</Link>
              </Button>
            ) : null}
            <ThemeToggle
              withTooltip
              className='rounded-full border border-transparent text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-primary'
            />
            <Button
              asChild
              size='sm'
              className={marketingHeaderPrimaryCtaClassName}
            >
              <Link href={primaryCtaHref}>
                {primaryCtaLabel}
                <ArrowRight
                  aria-hidden='true'
                  className='size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                />
              </Link>
            </Button>
          </>
        ) : (
          <>
            {createPlanCta ? (
              <Button
                variant='ghost'
                size='sm'
                className='gap-1.5 text-muted-foreground hover:text-foreground'
                asChild
              >
                <Link
                  href={createPlanCta.href}
                  aria-label={createPlanCta.label}
                >
                  <Plus className='size-3.5' aria-hidden='true' />
                  <span className='hidden lg:inline'>
                    {createPlanCta.label}
                  </span>
                </Link>
              </Button>
            ) : null}

            {showHeaderAccountChrome ? (
              <>
                <ThemeToggle withTooltip />
                <AuthControls
                  isAuthenticated={isAuthenticated}
                  tier={isAuthenticated ? tier : undefined}
                  showClerkUserButton={showClerkUserButton}
                  userName={userName}
                  userImageUrl={userImageUrl}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
