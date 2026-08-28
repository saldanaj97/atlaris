'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import { marketingHeaderPrimaryCtaClassName } from '@/components/shared/nav/marketing-header-classes';
import MobileNavigation from '@/components/shared/nav/MobileNavigation';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type NavItem, ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface MobileHeaderProps {
  isMarketing: boolean;
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
 * Compact header + hamburger when viewport below `md`. From `md` up, {@link DesktopHeader}
 * shows inline nav links instead.
 *
 * Marketing routes: brand + menu + theme toggle + peach CTA (no app avatar chrome).
 */
export default function MobileHeader({
  isMarketing,
  pathname,
  navItems,
  tier,
  canCreatePlan,
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
}: MobileHeaderProps) {
  const primaryCtaHref = isAuthenticated
    ? ROUTES.DASHBOARD
    : ROUTES.AUTH.SIGN_IN;
  const primaryCtaLabel = isAuthenticated ? 'Dashboard' : 'Begin tonight';
  const appCtaHref = !isAuthenticated
    ? ROUTES.AUTH.SIGN_IN
    : canCreatePlan === true
      ? ROUTES.PLANS.NEW
      : canCreatePlan === false
        ? ROUTES.PRICING
        : undefined;
  const appCtaAriaLabel = !isAuthenticated
    ? 'Sign in'
    : canCreatePlan === false
      ? 'Upgrade'
      : 'Create new plan';
  const appCtaTooltip = !isAuthenticated
    ? 'Sign in'
    : canCreatePlan === false
      ? 'Upgrade'
      : 'New plan';

  return (
    <div className='relative grid h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-4 md:hidden'>
      <div className='relative z-10 flex shrink-0'>
        <MobileNavigation
          isMarketing={isMarketing}
          pathname={pathname}
          navItems={navItems}
          canCreatePlan={canCreatePlan}
          isAuthenticated={isAuthenticated}
        />
      </div>

      <div className='relative z-10 flex min-w-0 items-center justify-center overflow-hidden' />

      <div className='pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center'>
        <div className='pointer-events-auto'>
          <BrandLogo size='sm' />
        </div>
      </div>

      <div className='relative z-10 flex min-w-0 shrink-0 items-center gap-1'>
        {isMarketing ? (
          <>
            <div className='shrink-0'>
              <ThemeToggle size='icon-sm' withTooltip />
            </div>
            <Button
              asChild
              size='sm'
              className={cn(
                marketingHeaderPrimaryCtaClassName,
                'px-3 py-1.5 text-xs',
              )}
            >
              <Link href={primaryCtaHref}>{primaryCtaLabel}</Link>
            </Button>
          </>
        ) : (
          <>
            {appCtaHref ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant='ghost'
                    size='icon-sm'
                    className='shrink-0 text-muted-foreground hover:text-foreground'
                  >
                    <Link href={appCtaHref} aria-label={appCtaAriaLabel}>
                      <Plus className='size-4' />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='bottom'>{appCtaTooltip}</TooltipContent>
              </Tooltip>
            ) : null}
            <div className='shrink-0'>
              <ThemeToggle size='icon-sm' withTooltip />
            </div>
            <div className='min-w-0 shrink-0'>
              <AuthControls
                isAuthenticated={isAuthenticated}
                tier={isAuthenticated ? tier : undefined}
                showClerkUserButton={showClerkUserButton}
                userName={userName}
                userImageUrl={userImageUrl}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
