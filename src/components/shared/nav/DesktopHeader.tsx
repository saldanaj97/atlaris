'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import DesktopNavigation from '@/components/shared/nav/DesktopNavigation';
import { marketingHeaderPrimaryCtaClassName } from '@/components/shared/nav/marketing-header-classes';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { resolveCreatePlanCta, ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { ArrowRight, Plus } from 'lucide-react';
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
}

/**
 * Desktop header (visible from `md` up). Below `md`, {@link MobileHeader} renders.
 *
 * App layout: brand (left) | navigation (center) | auth controls (right)
 * Marketing layout: brand + nav (left) | sign-in + theme + inverse CTA (right)
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
}: DesktopHeaderProps) {
  const showAppShellChrome = isAppShell && !isMarketing;
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
        isAppShell ? 'lg:grid' : showMarketingChrome ? 'md:flex' : 'md:grid',
        showAppShellChrome
          ? 'grid-cols-[minmax(0,1fr)_auto]'
          : showMarketingChrome
            ? 'justify-between gap-8'
            : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
      )}
    >
      {!showAppShellChrome ? (
        <div
          className={cn(
            'relative z-10 flex min-w-0 items-center',
            showMarketingChrome ? 'gap-8 lg:gap-12' : 'justify-self-start',
          )}
        >
          <BrandLogo />
          {showMarketingChrome ? (
            <DesktopNavigation
              pathname={pathname}
              navItems={navItems}
              appearance='marketing'
            />
          ) : null}
        </div>
      ) : null}

      {!showAppShellChrome && !showMarketingChrome ? (
        <div className='relative z-10 flex justify-self-center'>
          <DesktopNavigation
            pathname={pathname}
            navItems={navItems}
            appearance='default'
          />
        </div>
      ) : null}

      {/* Auth / CTA controls (right) */}
      <div
        className={cn(
          'relative z-10 flex min-w-0 items-center justify-end gap-2 justify-self-end',
          showAppShellChrome && 'col-start-2',
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

            <ThemeToggle withTooltip />

            <AuthControls
              isAuthenticated={isAuthenticated}
              tier={isAuthenticated ? tier : undefined}
              showClerkUserButton={showClerkUserButton}
              userName={userName}
              userImageUrl={userImageUrl}
            />
          </>
        )}
      </div>
    </div>
  );
}
