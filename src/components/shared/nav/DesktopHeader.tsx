'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import DesktopNavigation from '@/components/shared/nav/DesktopNavigation';
import { marketingHeaderPrimaryCtaClassName } from '@/components/shared/nav/marketing-header-classes';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { CREATE_PLAN_LABEL, ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface DesktopHeaderProps {
  isMarketing: boolean;
  /** App-shell routes render navigation in the sidebar. */
  isAppShell?: boolean;
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  userName?: string;
  userImageUrl?: string | null;
}

function DesktopHeaderStart({
  showAppShellChrome,
}: {
  showAppShellChrome: boolean;
}) {
  if (!showAppShellChrome) {
    return (
      <div className='relative z-10 flex min-w-0 items-center justify-self-start'>
        <BrandLogo />
      </div>
    );
  }

  return null;
}

function DesktopHeaderCenter({
  navItems,
  pathname,
  showAppShellChrome,
  showMarketingChrome,
}: {
  navItems: NavItem[];
  pathname: string;
  showAppShellChrome: boolean;
  showMarketingChrome: boolean;
}) {
  if (showAppShellChrome) return null;

  return (
    <div className='relative z-10 flex justify-self-center'>
      <DesktopNavigation
        pathname={pathname}
        navItems={navItems}
        appearance={showMarketingChrome ? 'marketing' : 'default'}
      />
    </div>
  );
}

function DesktopMarketingActions({
  isAuthenticated,
  primaryCtaHref,
  primaryCtaLabel,
}: {
  isAuthenticated: boolean;
  primaryCtaHref: string;
  primaryCtaLabel: string;
}) {
  return (
    <>
      {!isAuthenticated ? (
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-foreground'
        >
          <Link href={ROUTES.AUTH.SIGN_IN}>Sign in</Link>
        </Button>
      ) : null}
      <ThemeToggle
        withTooltip
        className='rounded-full text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-primary'
      />
      {/* oxlint-disable shadcn/require-static-classes -- The marketing CTA class is a complete shared recipe. */}
      <Button asChild size='sm' className={marketingHeaderPrimaryCtaClassName}>
        <Link href={primaryCtaHref}>
          {primaryCtaLabel}
          <ArrowRight
            aria-hidden='true'
            className='size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
          />
        </Link>
      </Button>
      {/* oxlint-enable shadcn/require-static-classes */}
    </>
  );
}

function DesktopAppActions({
  isAuthenticated,
  showClerkUserButton,
  showHeaderAccountChrome,
  tier,
  userImageUrl,
  userName,
}: {
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  showHeaderAccountChrome: boolean;
  tier?: SubscriptionTier;
  userImageUrl?: string | null;
  userName?: string;
}) {
  return (
    <>
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
  );
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
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
}: DesktopHeaderProps) {
  const showAppShellChrome = isAppShell && !isMarketing;
  const showHeaderAccountChrome = !showAppShellChrome;
  const showMarketingChrome = isMarketing && !showAppShellChrome;
  const primaryCtaHref = isAuthenticated ? ROUTES.DASHBOARD : ROUTES.PLANS.NEW;
  const primaryCtaLabel = isAuthenticated ? 'Dashboard' : CREATE_PLAN_LABEL;

  return (
    <div
      className={cn(
        'relative hidden h-[64px] w-full items-center',
        isAppShell ? 'lg:grid' : 'md:grid',
        showAppShellChrome
          ? 'grid-cols-[minmax(0,1fr)_auto]'
          : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
      )}
    >
      <DesktopHeaderStart showAppShellChrome={showAppShellChrome} />
      <DesktopHeaderCenter
        navItems={navItems}
        pathname={pathname}
        showAppShellChrome={showAppShellChrome}
        showMarketingChrome={showMarketingChrome}
      />
      <div
        className={cn(
          'relative z-10 flex min-w-0 items-center justify-end gap-2 justify-self-end',
          showAppShellChrome && 'col-start-2',
        )}
      >
        {isMarketing ? (
          <DesktopMarketingActions
            isAuthenticated={isAuthenticated}
            primaryCtaHref={primaryCtaHref}
            primaryCtaLabel={primaryCtaLabel}
          />
        ) : (
          <DesktopAppActions
            isAuthenticated={isAuthenticated}
            showClerkUserButton={showClerkUserButton}
            showHeaderAccountChrome={showHeaderAccountChrome}
            tier={tier}
            userImageUrl={userImageUrl}
            userName={userName}
          />
        )}
      </div>
    </div>
  );
}
