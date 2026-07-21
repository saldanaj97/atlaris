'use client';

import type { HeaderShellVariant } from '@/components/shared/nav/header-shell';
import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import DesktopNavigation from '@/components/shared/nav/DesktopNavigation';
import { isMarketingHeaderChrome } from '@/components/shared/nav/header-shell';
import HeaderLiquidGlassShell from '@/components/shared/nav/HeaderLiquidGlassShell';
import { marketingHeaderPrimaryCtaClassName } from '@/components/shared/nav/marketing-header-classes';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';

interface DesktopHeaderProps {
  headerVariant: HeaderShellVariant;
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  userName?: string;
  userImageUrl?: string | null;
}

/**
 * Desktop header (visible from `md` up). Below `md`, {@link MobileHeader} renders.
 *
 * Layout: brand (left) | navigation (center) | auth controls (right)
 * Marketing routes use After Hours chrome: outline nav pills + one peach CTA.
 */
export default function DesktopHeader({
  headerVariant,
  pathname,
  navItems,
  tier,
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
}: DesktopHeaderProps) {
  const isMarketing = isMarketingHeaderChrome(headerVariant);
  const primaryCtaHref = isAuthenticated
    ? ROUTES.PLANS.NEW
    : ROUTES.AUTH.SIGN_IN;
  const primaryCtaLabel = isAuthenticated ? 'Create a plan' : 'Get started';

  const headerContent = (
    <>
      {/* Brand (left) */}
      <div className='relative z-10 flex min-w-0 items-center justify-self-start'>
        <BrandLogo />
      </div>

      {/* Navigation (center column) */}
      <div className='relative z-10 flex justify-self-center'>
        <DesktopNavigation
          pathname={pathname}
          navItems={navItems}
          appearance={isMarketing ? 'marketing' : 'default'}
        />
      </div>

      {/* Auth / CTA controls (right) */}
      <div className='relative z-10 flex min-w-0 items-center justify-end gap-2 justify-self-end'>
        {isMarketing ? (
          <>
            <ThemeToggle
              withTooltip
              className='rounded-full border border-transparent text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-primary'
            />
            <Button
              asChild
              size='sm'
              className={cn(marketingHeaderPrimaryCtaClassName)}
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
            <Button
              variant='ghost'
              size='sm'
              className='gap-1.5 text-muted-foreground hover:text-foreground'
              asChild
            >
              <Link
                href={isAuthenticated ? ROUTES.PLANS.NEW : ROUTES.AUTH.SIGN_IN}
                aria-label='New Plan'
              >
                <Plus className='size-3.5' aria-hidden='true' />
                <span className='hidden lg:inline'>New Plan</span>
              </Link>
            </Button>

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
    </>
  );

  return (
    <HeaderLiquidGlassShell layout='desktop' variant={headerVariant}>
      {headerContent}
    </HeaderLiquidGlassShell>
  );
}
